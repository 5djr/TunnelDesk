const { spawn } = require("child_process");
const { shell } = require("electron");
const { activeConnections, latencyHistory } = require("./state");
const { sendConnectionLog, updateStatus, safeSend } = require("./messaging");

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
  const args = [
    "access",
    cfAccess,
    "--hostname",
    connection.hostname,
    "--url",
    `${cfAccess}://localhost:${connection.port}`,
  ];
  const proc = spawn(cfBinary, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  activeConnections.set(connection.id, { proc, connection, password });
  updateStatus(connection.id, "connecting");

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
  }
  activeConnections.delete(connectionId);
  updateStatus(connectionId, "disconnected");
}

module.exports = {
  isProcessAlive,
  startCloudflared,
  stopConnection,
};
