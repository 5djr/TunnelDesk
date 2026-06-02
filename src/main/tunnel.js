const { spawn } = require("child_process");
const { shell } = require("electron");
const { activeConnections, latencyHistory } = require("./state");
const { sendConnectionLog, updateStatus, safeSend } = require("./messaging");
const { getFreeLocalPort, pickLoopbackHost } = require("./net-utils");

const IS_MAC = process.platform === "darwin";

function isProcessAlive(proc) {
  if (!proc) return false;
  try {
    return proc.exitCode === null;
  } catch {
    return false;
  }
}

// Matches auth URLs emitted by cloudflared when Cloudflare Access login is required.
function extractAuthUrl(text) {
  const match = text.match(/https:\/\/\S+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[,.)]+$/, ""));
    if (url.protocol !== "https:") return null;
    if (
      !url.hostname.endsWith("cloudflareaccess.com") &&
      !url.hostname.endsWith("argotunnel.com")
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function openAuthUrl(connectionId, url) {
  shell.openExternal(url).catch(() => {});
  sendConnectionLog(
    connectionId,
    "Cloudflare Access login required — your browser has been opened.",
  );
  safeSend("auth-required", { id: connectionId, url });
}

function waitForCloudflaredReady(proc, id) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    // Set when a Cloudflare Access auth URL is detected; cancels the 1800ms
    // fallback timeout so we wait for the actual "ready" signal after login.
    let authDetected = false;
    let timeout;

    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          `cloudflared exited with ${code || signal}. ${stderr.trim().slice(0, 300)}`,
        ),
      );
    };

    const handleAuthUrl = (text) => {
      if (authDetected) return;
      const url = extractAuthUrl(text);
      if (!url) return;
      authDetected = true;
      clearTimeout(timeout); // wait for real "ready" after login, not the fallback
      openAuthUrl(id, url);
      sendConnectionLog(id, "Waiting for browser authentication…");
      // Post-auth fallback: if cloudflared never prints a ready signal after login,
      // assume it is connected after 45 s rather than hanging indefinitely.
      timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      }, 45000);
    };

    const onStdout = (chunk) => {
      const text = chunk.toString();
      const line = text.trim();
      if (line) sendConnectionLog(id, line);
      handleAuthUrl(text);
      if (!settled && /started|ready|connected|listening|serving/i.test(text)) {
        settled = true;
        cleanup();
        resolve();
      }
    };

    const onStderr = (chunk) => {
      const text = chunk.toString();
      if (stderr.length < 4096) stderr += text;
      const line = text.trim();
      if (line) sendConnectionLog(id, line);
      handleAuthUrl(text);
      // Exclude JSON log lines where "error" appears as a null field (e.g. cloudflared
      // structured logs emit {"error":null,...} on every healthy startup line).
      const isJsonNullError = /"error"\s*:\s*null/i.test(text);
      if (
        !settled &&
        !isJsonNullError &&
        /(\berror\b|failed|forbidden|denied|not installed|address already in use|conflict)/i.test(
          text,
        )
      ) {
        settled = true;
        cleanup();
        reject(new Error(stderr.trim().slice(0, 500)));
      }
    };

    // Use proc.off() with named references so the persistent handlers added by
    // startCloudflared are not accidentally removed.
    const cleanup = () => {
      clearTimeout(timeout);
      proc.off("error", onError);
      proc.off("exit", onExit);
      if (proc.stdout) proc.stdout.off("data", onStdout);
      if (proc.stderr) proc.stderr.off("data", onStderr);
    };

    // Fallback: if no clear signal arrives in 1800 ms and no auth is pending,
    // assume cloudflared is ready (some versions don't print a ready line).
    timeout = setTimeout(() => {
      if (!settled && !authDetected) {
        settled = true;
        cleanup();
        resolve();
      }
    }, 1800);

    proc.on("error", onError);
    proc.on("exit", onExit);
    if (proc.stdout) proc.stdout.on("data", onStdout);
    if (proc.stderr) proc.stderr.on("data", onStderr);
  });
}

// password is decrypted before being passed here so it can be stored in memory
// for later RDP reconnects without re-reading the config file.
// cfBinaryPath overrides the system PATH lookup when a custom path is configured.
async function startCloudflared(connection, password, cfBinaryPath) {
  const existing = activeConnections.get(connection.id);
  if (existing && isProcessAlive(existing.proc)) {
    return existing.proc;
  }

  const cfBinary =
    cfBinaryPath && cfBinaryPath.trim() ? cfBinaryPath.trim() : "cloudflared";
  const cfAccess = (connection.protocol || "rdp-cf") === "ssh-cf" ? "ssh" : "rdp";
  // Give every simultaneous tunnel its own loopback IP (127.0.0.1, 127.0.0.2, …)
  // on Windows and Linux. On Windows this gives each RDP its own TERMSRV/<ip>
  // saved-credential target (mstsc strips the port, so tunnels sharing one host
  // would clobber each other's logins); on Linux it keeps each connection's
  // watcher/stats endpoint unambiguous. macOS only configures 127.0.0.1 by
  // default, so it stays there and relies on the unique port for isolation.
  const localHost = IS_MAC
    ? "127.0.0.1"
    : pickLoopbackHost(
        [...activeConnections.values()].map((e) => e.localHost).filter(Boolean),
      );
  // Reserve the loopback host synchronously (before the await below) so a
  // concurrent connect for another tunnel sees it taken and picks a different
  // IP — otherwise both could share one Windows credential target.
  activeConnections.set(connection.id, { proc: null, connection, password, localHost });
  updateStatus(connection.id, "connecting");

  // Allocate a unique loopback port on that host so multiple connections
  // (e.g. two RDP hosts both configured for 3389) never fight over one port.
  let localPort;
  try {
    localPort = await getFreeLocalPort(localHost);
  } catch (err) {
    activeConnections.delete(connection.id); // release the reservation on failure
    throw err;
  }

  // stopConnection may have removed the reservation while we awaited the port.
  const reserved = activeConnections.get(connection.id);
  if (!reserved) throw new Error("Connection cancelled");

  const args = [
    "access",
    cfAccess,
    "--hostname",
    connection.hostname,
    "--url",
    `${cfAccess}://${localHost}:${localPort}`,
  ];
  const proc = spawn(cfBinary, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  reserved.proc = proc;
  reserved.localPort = localPort;

  proc.on("exit", () => {
    const entry = activeConnections.get(connection.id);
    const mstscAlive = entry && entry.mstscProc && entry.mstscProc.exitCode === null;
    if (mstscAlive) {
      // Cloudflare Access session expired but the RDP window is still open.
      // Keep "connected" so the user isn't confused — the session will drop
      // naturally once the server side times out. The mstsc exit handler below
      // will do the final cleanup when the window eventually closes.
      sendConnectionLog(
        connection.id,
        "Cloudflare tunnel closed — your RDP session may remain active until the server disconnects.",
      );
      entry.proc = null;
    } else {
      updateStatus(connection.id, "disconnected");
      activeConnections.delete(connection.id);
    }
  });

  proc.on("error", (error) => {
    sendConnectionLog(connection.id, `Failed to start cloudflared: ${error.message}`);
  });

  await waitForCloudflaredReady(proc, connection.id);
  const entry = activeConnections.get(connection.id);
  if (!entry) return proc; // stopConnection was called while we were waiting
  entry.connectedAt = Date.now();
  updateStatus(connection.id, "connected");
  return proc;
}

async function stopConnection(connectionId) {
  latencyHistory.delete(connectionId);
  const active = activeConnections.get(connectionId);
  if (active) {
    if (active.mstscProc && active.mstscProc.exitCode === null) {
      try {
        active.mstscProc.kill();
      } catch {}
    }
    if (active.proc && !active.proc.killed) {
      try {
        active.proc.kill();
      } catch (error) {
        sendConnectionLog(
          connectionId,
          `Unable to stop tunnel cleanly: ${error.message}`,
        );
      }
    }
    // Remove the Windows credential stored for this tunnel's loopback target so
    // credentials don't accumulate in Credential Manager across reconnects. CF
    // tunnels bind a per-connection loopback IP; direct RDP uses the real host.
    const proto = active.connection && (active.connection.protocol || "rdp-cf");
    if (proto === "rdp-cf" || proto === "rdp") {
      try {
        const { deleteStoredCredential } = require("./rdp");
        const host = active.localHost ?? active.connection.hostname;
        deleteStoredCredential(host, active.localPort ?? active.connection.port);
      } catch {}
    }
  }
  activeConnections.delete(connectionId);
  updateStatus(connectionId, "disconnected");
}

module.exports = {
  isProcessAlive,
  startCloudflared,
  stopConnection,
};
