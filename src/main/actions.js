const { shell } = require("electron");
const { readConnections } = require("./connections");
const { decryptPassword } = require("./crypto");
const { readSettings } = require("./settings");
const { activeConnections } = require("./state");
const { startCloudflared, stopConnection } = require("./tunnel");
const { launchRemoteDesktop, launchRemoteDesktopDirect } = require("./rdp");
const { sendConnectionLog, updateStatus } = require("./messaging");
const { closeSessionsForConnection } = require("./ssh-session");
const { closeTelnetSessionsForConnection } = require("./telnet-session");
const { closeSerialSessionsForConnection } = require("./serial-session");

async function connectById(connectionId) {
  const connections = await readConnections();
  let connection = connections.find((item) => item.id === connectionId);
  if (!connection) {
    // Fall back to org-managed connections (not stored in connections.json).
    const { getManagedConnections } = require("./sync");
    connection = getManagedConnections().find((item) => item.id === connectionId);
  }
  if (!connection) throw new Error("Connection not found");

  const password =
    decryptPassword(connection.encryptedPassword) || connection.password || undefined;
  const protocol = connection.protocol || "rdp-cf";
  const settings = await readSettings();

  if (protocol === "rdp-cf") {
    await startCloudflared(connection, password, settings.cloudflaredPath);
    // cloudflared listens on a dynamically allocated loopback port (see tunnel.js);
    // point mstsc/xfreerdp at that port, not the configured one.
    const entry = activeConnections.get(connection.id);
    const localPort = entry?.localPort ?? connection.port;
    await launchRemoteDesktop(localPort, connection.id, connection.username, password);
  } else if (protocol === "rdp") {
    await launchRemoteDesktopDirect(connection, password);
  } else if (protocol === "ssh-cf") {
    await startCloudflared(connection, password, settings.cloudflaredPath);
    // Embedded terminal is opened by the renderer via IPC after connect resolves.
  } else if (protocol === "ssh") {
    updateStatus(connection.id, "connecting");
    activeConnections.set(connection.id, {
      proc: null,
      connection,
      password,
      connectedAt: null, // set when SSH session actually establishes
    });
    // Status is updated to "connected" / "disconnected" by the terminal window
    // once ssh2 actually succeeds or fails — see ssh-report-status IPC.
  } else if (protocol === "telnet") {
    updateStatus(connection.id, "connecting");
    activeConnections.set(connection.id, {
      proc: null,
      connection,
      password,
      connectedAt: null, // set by terminal window via ssh-report-status IPC
    });
    // Status transitions to "connected" / "disconnected" when the terminal
    // window successfully opens the embedded Telnet session (see ssh-report-status).
  } else if (protocol === "serial") {
    updateStatus(connection.id, "connecting");
    activeConnections.set(connection.id, {
      proc: null,
      connection,
      password,
      connectedAt: null, // set by terminal window via ssh-report-status IPC
    });
    // The terminal window opens the embedded serial session and reports back
    // connected / disconnected via ssh-report-status, just like SSH/Telnet.
  } else if (protocol === "http" || protocol === "https") {
    const url = `${protocol}://${connection.hostname}:${connection.port}`;
    await shell.openExternal(url);
    sendConnectionLog(connection.id, `Opened ${url} in browser.`);
  }

  return { status: "connected" };
}

async function disconnectById(connectionId) {
  closeSessionsForConnection(connectionId);
  closeTelnetSessionsForConnection(connectionId);
  closeSerialSessionsForConnection(connectionId);
  await stopConnection(connectionId);
  return { status: "disconnected" };
}

module.exports = { connectById, disconnectById };
