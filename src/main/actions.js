const { shell } = require("electron");
const { readConnections } = require("./connections");
const { decryptPassword } = require("./crypto");
const { readSettings } = require("./settings");
const { startCloudflared, stopConnection } = require("./tunnel");
const {
  launchRemoteDesktop,
  launchRemoteDesktopDirect,
  launchSshClient,
  launchTelnetClient,
} = require("./rdp");
const { sendConnectionLog } = require("./messaging");

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
    await launchSshClient(
      "localhost",
      connection.port,
      connection.username,
      connection.id,
      connection.sshKeyPath,
    );
  } else if (protocol === "ssh") {
    await launchSshClient(
      connection.hostname,
      connection.port,
      connection.username,
      connection.id,
      connection.sshKeyPath,
    );
  } else if (protocol === "telnet") {
    await launchTelnetClient(connection.hostname, connection.port, connection.id);
  } else if (protocol === "http" || protocol === "https") {
    const url = `${protocol}://${connection.hostname}:${connection.port}`;
    await shell.openExternal(url);
    sendConnectionLog(connection.id, `Opened ${url} in browser.`);
  }

  return { status: "connected" };
}

async function disconnectById(connectionId) {
  await stopConnection(connectionId);
  return { status: "disconnected" };
}

module.exports = { connectById, disconnectById };
