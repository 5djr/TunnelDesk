const fs = require("fs");
const { spawn } = require("child_process");
const { activeConnections } = require("./state");
const { safeSend, sendConnectionLog, updateStatus } = require("./messaging");

// ─── External RDP watcher ─────────────────────────────────────────────────────
// After the tracked mstsc exits (while cloudflared is still alive), poll netstat
// so we notice if the user opens their own Remote Desktop and connects through
// the still-running tunnel. Clears the "RDP Disconnected" UI state automatically.

const rdpWatchers = new Map(); // connectionId -> setTimeout handle

function checkRdpActive(port) {
  return new Promise((resolve) => {
    const proc = spawn("netstat", ["-n", "-p", "TCP"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    proc.stdout.on("data", (d) => {
      if (out.length < 65536) out += d.toString();
    });
    proc.on("close", () => {
      // Match 127.0.0.1:<port> (not followed by another digit) on an ESTABLISHED line.
      const portRe = new RegExp(`127\\.0\\.0\\.1:${port}(?!\\d)`);
      const found = out
        .split("\n")
        .some((line) => portRe.test(line) && line.includes("ESTABLISHED"));
      resolve(found);
    });
    proc.on("error", () => resolve(false));
  });
}

function stopRdpWatcher(connectionId) {
  const t = rdpWatchers.get(connectionId);
  if (t !== undefined) {
    clearTimeout(t);
    rdpWatchers.delete(connectionId);
  }
}

function startRdpWatcher(connectionId, port) {
  stopRdpWatcher(connectionId);

  const poll = async () => {
    const entry = activeConnections.get(connectionId);
    // Stop if cloudflared is gone or a tracked mstsc process took over.
    const cfAlive = entry && entry.proc && entry.proc.exitCode === null;
    if (!cfAlive) {
      rdpWatchers.delete(connectionId);
      return;
    }
    if (entry.mstscProc && entry.mstscProc.exitCode === null) {
      rdpWatchers.delete(connectionId);
      return;
    }

    const isActive = await checkRdpActive(port);

    // Re-check after the async netstat call — state may have changed.
    const e = activeConnections.get(connectionId);
    const stillCf = e && e.proc && e.proc.exitCode === null;
    if (!stillCf) {
      rdpWatchers.delete(connectionId);
      return;
    }
    if (e.mstscProc && e.mstscProc.exitCode === null) {
      rdpWatchers.delete(connectionId);
      return;
    }

    if (!e.rdpOpen && isActive) {
      // External RDP client connected through the tunnel.
      e.rdpOpen = true;
      e.mstscProc = null;
      sendConnectionLog(connectionId, "External RDP client connected through tunnel.");
      safeSend("rdp-reconnected", { id: connectionId });
    } else if (e.rdpOpen && !isActive) {
      // External RDP client disconnected — show "RDP Disconnected" again.
      e.rdpOpen = false;
      safeSend("rdp-closed", { id: connectionId });
    }

    // Keep watching until cloudflared dies or a tracked mstsc takes over.
    rdpWatchers.set(connectionId, setTimeout(poll, 2000));
  };

  rdpWatchers.set(connectionId, setTimeout(poll, 2000));
}

function runCmdkey(args) {
  return new Promise((resolve) => {
    const proc = spawn("cmdkey", args, { windowsHide: true, stdio: "ignore" });
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    // 5-second timeout as a safety net; cmdkey normally finishes in < 500 ms.
    const timer = setTimeout(done, 5000);
    proc.on("exit", done);
    proc.on("error", done);
  });
}

async function storeCredential(port, username, password) {
  // mstsc may look up credentials with or without the port suffix for port 3389,
  // so we store under both forms to guarantee a hit.
  const targets = [`TERMSRV/localhost:${port}`];
  if (port === 3389) targets.push("TERMSRV/localhost");

  for (const target of targets) {
    // Delete any stale entry first so the fresh credential is always used.
    await runCmdkey([`/delete:${target}`]);
    await runCmdkey([`/add:${target}`, `/user:${username}`, `/pass:${password}`]);
  }
}

async function launchRemoteDesktop(port, connectionId, username, password) {
  stopRdpWatcher(connectionId); // cancel any pending external-connection poll

  if (username && password) {
    await storeCredential(port, username, password);
  }

  const mstsc = spawn("mstsc", [`/v:localhost:${port}`], { stdio: "ignore" });

  const active = activeConnections.get(connectionId);
  if (active) {
    active.mstscProc = mstsc;
    active.rdpOpen = true;
  }

  mstsc.on("exit", () => {
    const entry = activeConnections.get(connectionId);
    if (entry) entry.rdpOpen = false;
    const cfAlive = entry && entry.proc && entry.proc.exitCode === null;
    if (cfAlive) {
      // Tunnel still running — notify renderer so the "Reconnect RDP" button appears,
      // then start watching for an external mstsc that connects through the tunnel.
      safeSend("rdp-closed", { id: connectionId });
      startRdpWatcher(connectionId, entry.connection.port);
    } else {
      // Tunnel is also gone (e.g. CF Access session expired). Skip the transient
      // "RDP Disconnected" flash and go straight to a clean disconnected state.
      activeConnections.delete(connectionId);
      updateStatus(connectionId, "disconnected");
    }
  });

  mstsc.on("error", () => {
    sendConnectionLog(
      connectionId,
      "Failed to launch mstsc. Ensure Remote Desktop is available on Windows.",
    );
  });
}

// Direct RDP with no cloudflared tunnel — tracks mstsc like rdp-cf does for reconnect.
async function launchRemoteDesktopDirect(connection, password) {
  if (connection.username && password) {
    await storeCredential(connection.port, connection.username, password);
  }

  updateStatus(connection.id, "connecting");
  activeConnections.set(connection.id, {
    proc: null,
    connection,
    password,
    connectedAt: Date.now(),
  });

  const mstsc = spawn("mstsc", [`/v:${connection.hostname}:${connection.port}`], {
    stdio: "ignore",
  });

  const active = activeConnections.get(connection.id);
  if (active) active.mstscProc = mstsc;

  mstsc.on("exit", () => {
    // Don't auto-disconnect — mstsc can exit immediately when it hands off to an
    // already-running Remote Desktop window. The user controls lifecycle via Disconnect.
    const entry = activeConnections.get(connection.id);
    if (entry) entry.mstscProc = null;
  });

  mstsc.on("error", () => {
    sendConnectionLog(
      connection.id,
      "Failed to launch mstsc. Ensure Remote Desktop is available on Windows.",
    );
    activeConnections.delete(connection.id);
    updateStatus(connection.id, "disconnected");
  });

  updateStatus(connection.id, "connected");
}

// Opens a new cmd window running ssh. Fire-and-forget — SSH is interactive.
// sshKeyPath is optional; when provided it is passed as -i <path>.
async function launchSshClient(hostname, port, username, connectionId, sshKeyPath) {
  const target = username ? `${username}@${hostname}` : hostname;
  const sshArgs = [];
  if (sshKeyPath && sshKeyPath.trim()) {
    const keyPath = sshKeyPath.trim();
    if (!fs.existsSync(keyPath)) {
      sendConnectionLog(
        connectionId,
        `SSH key not found: ${keyPath} — connecting without key.`,
      );
    } else {
      sshArgs.push("-i", keyPath);
    }
  }
  sshArgs.push("-p", String(port), target);
  const proc = spawn("cmd", ["/c", "start", `SSH — ${hostname}`, "ssh", ...sshArgs], {
    windowsHide: true,
  });
  proc.on("error", () => {
    sendConnectionLog(
      connectionId,
      "Failed to open SSH. Install OpenSSH Client via Settings → Apps → Optional Features.",
    );
  });
  sendConnectionLog(connectionId, `SSH — opening terminal to ${target}:${port}`);
}

// Opens a new cmd window running telnet. Fire-and-forget.
async function launchTelnetClient(hostname, port, connectionId) {
  const proc = spawn(
    "cmd",
    ["/c", "start", `Telnet — ${hostname}`, "telnet", hostname, String(port)],
    { windowsHide: true },
  );
  proc.on("error", () => {
    sendConnectionLog(
      connectionId,
      "Failed to open Telnet. Enable Telnet Client in Windows Features.",
    );
  });
  sendConnectionLog(connectionId, `Telnet — connecting to ${hostname}:${port}`);
}

module.exports = {
  storeCredential,
  launchRemoteDesktop,
  launchRemoteDesktopDirect,
  launchSshClient,
  launchTelnetClient,
};
