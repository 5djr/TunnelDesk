const { shell } = require("electron");
const { readConnections } = require("./connections");
const { decryptPassword } = require("./crypto");
const { readSettings } = require("./settings");
const { activeConnections } = require("./state");
const { startCloudflared, stopConnection } = require("./tunnel");
const {
  launchRemoteDesktop,
  launchRemoteDesktopDirect,
  launchSshClient,
  launchTelnetClient,
} = require("./rdp");
const { sendConnectionLog, updateStatus } = require("./messaging");
const { closeSessionsForConnection } = require("./ssh-session");

async function connectById(connectionId) {
  const connections = await readConnections();
  const connection = connections.find((item) => item.id === connectionId);
  if (!connection) throw new Error("Connection not found");

  const password =
    decryptPassword(connection.encryptedPassword) || connection.password || undefined;
  const protocol = connection.protocol || "rdp-cf";
  const settings = await readSettings();

  if (protocol === "rdp-cf") {
    await startCloudflared(connection, password, settings.cloudflaredPath);
    await launchRemoteDesktop(
      connection.port,
      connection.id,
      connection.username,
      password,
    );
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
      connectedAt: Date.now(),
    });
    await launchTelnetClient(connection.hostname, connection.port, connection.id);
    updateStatus(connection.id, "connected");
  } else if (protocol === "http" || protocol === "https") {
    const url = `${protocol}://${connection.hostname}:${connection.port}`;
    await shell.openExternal(url);
    sendConnectionLog(connection.id, `Opened ${url} in browser.`);
  }

  return { status: "connected" };
}

async function disconnectById(connectionId) {
  closeSessionsForConnection(connectionId);
  await stopConnection(connectionId);
  return { status: "disconnected" };
}

module.exports = { connectById, disconnectById };
