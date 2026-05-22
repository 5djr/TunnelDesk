const os = require("os");
const path = require("path");
const { ipcMain, shell, dialog } = require("electron");
const {
  state,
  activeConnections,
  connectionStatuses,
  latencyHistory,
} = require("./state");
const {
  readConnections,
  writeConnections,
  sanitizeForRenderer,
} = require("./connections");
const { encryptPassword, decryptPassword } = require("./crypto");
const {
  normalizePort,
  sanitizeHostname,
  sanitizeUsername,
  sanitizeProtocol,
  sanitizePath,
  sanitizeNotes,
  sanitizeGroup,
  PROTOCOL_DEFAULTS,
} = require("./validation");
const { checkDependencies, getProcessMemoryBytes } = require("./system");
const { measureRoundTripLatency } = require("./latency");
const { isProcessAlive, stopConnection } = require("./tunnel");
const { updateStatus, sendConnectionLog } = require("./messaging");
const { connectById, disconnectById } = require("./actions");
const { readSettings, writeSettings } = require("./settings");
const { getLogFilePath } = require("./logger");
const { updateTrayMenu } = require("./tray");

function registerIpcHandlers() {
  ipcMain.handle("load-connections", async () => {
    const connections = await readConnections();
    return connections.map(sanitizeForRenderer);
  });

  ipcMain.handle("save-connection", async (event, connection) => {
    const connections = await readConnections();
    const hostname = sanitizeHostname(connection.hostname);
    if (!hostname) {
      throw new Error("Hostname is required and must be a valid value");
    }

    const existing = connections.find((c) => c.id === connection.id);

    let encryptedPassword;
    if (connection.password) {
      encryptedPassword = encryptPassword(String(connection.password).slice(0, 256));
    } else if (
      connection.keepExistingPassword &&
      existing &&
      existing.encryptedPassword
    ) {
      encryptedPassword = existing.encryptedPassword;
    } else {
      encryptedPassword = undefined;
    }

    const protocol = sanitizeProtocol(connection.protocol);
    const normalized = {
      id: connection.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      friendlyName: String(connection.friendlyName || connection.hostname || "")
        .trim()
        .slice(0, 128),
      hostname,
      port: normalizePort(connection.port || PROTOCOL_DEFAULTS[protocol]),
      username: sanitizeUsername(connection.username),
      encryptedPassword,
      protocol,
      notes: sanitizeNotes(connection.notes),
      group: sanitizeGroup(connection.group),
      sshKeyPath: sanitizePath(connection.sshKeyPath),
    };

    const existingIndex = connections.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      connections[existingIndex] = normalized;
    } else {
      connections.push(normalized);
    }

    await writeConnections(connections);
    updateTrayMenu();
    return sanitizeForRenderer(normalized);
  });

  ipcMain.handle("delete-connection", async (event, connectionId) => {
    const connections = await readConnections();
    const remaining = connections.filter((item) => item.id !== connectionId);
    await writeConnections(remaining);
    await stopConnection(connectionId);
    updateTrayMenu();
    return remaining.map(sanitizeForRenderer);
  });

  ipcMain.handle("connect", async (event, connectionId) => {
    try {
      const result = await connectById(connectionId);
      updateTrayMenu();
      return result;
    } catch (error) {
      updateStatus(connectionId, "disconnected");
      sendConnectionLog(
        connectionId,
        (error instanceof Error ? error.message : String(error)) || "Connection failed",
      );
      updateTrayMenu();
      throw error;
    }
  });

  ipcMain.handle("disconnect", async (event, connectionId) => {
    const result = await disconnectById(connectionId);
    updateTrayMenu();
    return result;
  });

  ipcMain.handle("launch-rdp", async (event, connectionId) => {
    const { launchRemoteDesktop } = require("./rdp");
    const active = activeConnections.get(connectionId);
    if (!active || !isProcessAlive(active.proc)) {
      throw new Error("Cloudflare tunnel is not active — connect first");
    }
    await launchRemoteDesktop(
      active.connection.port,
      connectionId,
      active.connection.username,
      active.password,
    );
    return { status: "launched" };
  });

  ipcMain.handle("check-dependencies", () => checkDependencies());

  ipcMain.handle("get-connection-statuses", () => {
    const result = {};
    for (const [id, status] of connectionStatuses.entries()) {
      result[id] = status;
    }
    return result;
  });

  ipcMain.handle("get-tunnel-stats", async (event, connectionId) => {
    const active = activeConnections.get(connectionId);
    if (!active) return null;

    const { proc, connection, connectedAt } = active;
    const protocol = connection.protocol || "rdp-cf";
    const isCfTunnel = protocol === "rdp-cf" || protocol === "ssh-cf";
    const isRdpProto = protocol === "rdp-cf" || protocol === "rdp";

    const alive = isCfTunnel ? isProcessAlive(proc) : true;
    const pid = proc ? proc.pid : null;
    const uptime = connectedAt ? Math.floor((Date.now() - connectedAt) / 1000) : null;

    const measureHost = isCfTunnel ? "127.0.0.1" : connection.hostname;

    const [latency, cloudflaredMemBytes, mstscMemBytes] = await Promise.all([
      alive
        ? measureRoundTripLatency(measureHost, connection.port, protocol)
        : Promise.resolve(null),
      isCfTunnel ? getProcessMemoryBytes(pid) : Promise.resolve(null),
      isRdpProto
        ? getProcessMemoryBytes(active.mstscProc?.pid ?? null)
        : Promise.resolve(null),
    ]);

    let history = latencyHistory.get(connectionId);
    if (!history) {
      history = [];
      latencyHistory.set(connectionId, history);
    }
    if (latency !== null) {
      history.push(latency);
      if (history.length > 60) history.shift();
    }

    const n = history.length;
    const latencyMin = n ? Math.min(...history) : null;
    const latencyMax = n ? Math.max(...history) : null;
    const latencyAvg = n ? Math.round(history.reduce((a, b) => a + b, 0) / n) : null;
    const latencyJitter =
      n > 1
        ? Math.round(
            Math.sqrt(history.reduce((s, x) => s + (x - latencyAvg) ** 2, 0) / n),
          )
        : null;

    const localIps = Object.entries(os.networkInterfaces()).flatMap(([name, addrs]) =>
      (addrs || [])
        .filter((a) => !a.internal && a.family === "IPv4")
        .map((a) => ({ name, address: a.address })),
    );

    return {
      pid,
      localEndpoint: isCfTunnel
        ? `localhost:${connection.port}`
        : `${connection.hostname}:${connection.port}`,
      hostname: connection.hostname,
      protocol,
      alive,
      connectedAt: connectedAt ?? null,
      uptime,
      latency,
      latencyMin,
      latencyMax,
      latencyAvg,
      latencyJitter,
      latencySamples: n,
      latencyHistoryMax: 60,
      cloudflaredVersion: state.cloudflaredVersion,
      cloudflaredMemBytes,
      mstscPid: active.mstscProc?.pid ?? null,
      mstscMemBytes,
      systemOs: `${os.version()} (${os.release()})`,
      systemHostname: os.hostname(),
      systemRamFree: os.freemem(),
      systemRamTotal: os.totalmem(),
      localIps,
    };
  });

  ipcMain.handle("get-settings", async () => {
    return readSettings();
  });

  ipcMain.handle("save-settings", async (event, partial) => {
    return writeSettings(partial);
  });

  ipcMain.handle("pick-file", async (event, opts = {}) => {
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: opts.title || "Select File",
      properties: ["openFile"],
      filters: opts.filters || [{ name: "All Files", extensions: ["*"] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("open-log-folder", async () => {
    const logPath = getLogFilePath();
    await shell.showItemInFolder(logPath);
  });

  ipcMain.handle("open-external", async (event, url) => {
    if (typeof url !== "string") return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
      await shell.openExternal(parsed.href);
    } catch {
      // Invalid URL — silently ignore.
    }
  });
}

module.exports = { registerIpcHandlers };
