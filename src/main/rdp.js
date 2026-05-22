const fs = require("fs");
const { spawn } = require("child_process");
const { activeConnections } = require("./state");
const { safeSend, sendConnectionLog, updateStatus } = require("./messaging");

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
    safeSend("rdp-closed", { id: connectionId });
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
    activeConnections.delete(connection.id);
    updateStatus(connection.id, "disconnected");
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
