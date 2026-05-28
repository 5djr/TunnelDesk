const os = require("os");
const path = require("path");
const { ipcMain, shell, dialog } = require("electron");
const {
  sshCreateTerm,
  sshCreateSftp,
  sshWrite,
  sshResize,
  sshCloseSession,
  cancelPendingConnections,
  sftpList,
  sftpHome,
  sftpDownload,
  sftpUpload,
  sftpDelete,
  sftpRename,
  sftpMkdir,
} = require("./ssh-session");
const {
  telnetCreateTerm,
  telnetWrite,
  telnetResize,
  telnetCloseSession,
} = require("./telnet-session");
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
const { updateStatus, sendConnectionLog, safeSend } = require("./messaging");
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

    let encryptedSshKeyPassphrase;
    if (connection.sshKeyPassphrase) {
      encryptedSshKeyPassphrase = encryptPassword(
        String(connection.sshKeyPassphrase).slice(0, 256),
      );
    } else if (
      connection.keepExistingSshKeyPassphrase &&
      existing &&
      existing.encryptedSshKeyPassphrase
    ) {
      encryptedSshKeyPassphrase = existing.encryptedSshKeyPassphrase;
    } else {
      encryptedSshKeyPassphrase = undefined;
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
      encryptedSshKeyPassphrase,
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
    safeSend("connection-saved");
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
    const { BrowserWindow } = require("electron");
    const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
    const result = await dialog.showOpenDialog(win, {
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

  ipcMain.handle("open-term-window", (_event, { connId, label }) => {
    const { createTerminalWindow } = require("./window");
    createTerminalWindow(connId, label || "Terminal");
    return { status: "opened" };
  });

  ipcMain.handle("open-form-window", (_event, { connId } = {}) => {
    const { createFormWindow } = require("./window");
    createFormWindow(connId || null);
    return { status: "opened" };
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

  // ─── SSH status reporting (ssh direct only) ────────────────────────────────
  // Terminal window calls this after sshTermCreate succeeds or fails so the
  // main window shows the correct connected / disconnected status.

  ipcMain.handle("ssh-report-status", (_event, { connId, ok }) => {
    if (ok) {
      const entry = activeConnections.get(connId);
      if (entry) {
        if (!entry.connectedAt) entry.connectedAt = Date.now();
        updateStatus(connId, "connected");
      }
    } else {
      activeConnections.delete(connId);
      updateStatus(connId, "disconnected");
    }
  });

  // ─── SSH terminal ──────────────────────────────────────────────────────────

  // ─── Telnet terminal ──────────────────────────────────────────────────────
  // Reuses the same ssh-data / ssh-close renderer events so the terminal tab
  // system works identically to SSH — routing is done via the sid Map.

  ipcMain.handle("telnet-term-create", async (_event, connectionId) => {
    return telnetCreateTerm(
      connectionId,
      (id, data) =>
        safeSend("ssh-data", { sid: id, data: Buffer.from(data).toString("base64") }),
      (id) => safeSend("ssh-close", { sid: id, code: null, signal: null }),
    );
  });

  ipcMain.handle("telnet-write", (_event, { sid, data }) => {
    telnetWrite(sid, data);
  });

  ipcMain.handle("telnet-resize", (_event, { sid, cols, rows }) => {
    telnetResize(sid, cols, rows);
  });

  ipcMain.handle("telnet-close-session", (_event, sid) => {
    telnetCloseSession(sid);
  });

  // ─── SSH terminal ──────────────────────────────────────────────────────────

  ipcMain.handle("ssh-term-create", async (_event, connectionId) => {
    return sshCreateTerm(
      connectionId,
      (id, data) =>
        safeSend("ssh-data", { sid: id, data: Buffer.from(data).toString("base64") }),
      (id, code, signal) => safeSend("ssh-close", { sid: id, code, signal }),
    );
  });

  ipcMain.handle("ssh-sftp-create", async (_event, connectionId) => {
    return sshCreateSftp(connectionId, (id) =>
      safeSend("ssh-close", { sid: id, code: null, signal: null }),
    );
  });

  ipcMain.handle("ssh-write", (_event, { sid, data }) => {
    sshWrite(sid, data);
  });

  ipcMain.handle("ssh-resize", (_event, { sid, cols, rows }) => {
    sshResize(sid, cols, rows);
  });

  ipcMain.handle("ssh-close-session", (_event, sid) => {
    sshCloseSession(sid);
  });

  ipcMain.handle("cancel-ssh-connect", (_event, connectionId) => {
    cancelPendingConnections(connectionId);
  });

  // ─── SFTP operations ───────────────────────────────────────────────────────

  ipcMain.handle("sftp-list", (_event, { sid, remotePath }) => {
    return sftpList(sid, remotePath);
  });

  ipcMain.handle("sftp-home", (_event, sid) => {
    return sftpHome(sid);
  });

  ipcMain.handle("sftp-download", async (event, { sid, remotePath }) => {
    const { BrowserWindow } = require("electron");
    const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
    const filename = remotePath.split("/").pop() || "file";
    const result = await dialog.showSaveDialog(win, {
      title: "Save File",
      defaultPath: filename,
    });
    if (result.canceled) return { canceled: true };
    await sftpDownload(sid, remotePath, result.filePath);
    return { filePath: result.filePath };
  });

  ipcMain.handle("sftp-delete", (_event, { sid, remotePath, isDir }) => {
    return sftpDelete(sid, remotePath, isDir);
  });

  ipcMain.handle("sftp-rename", (_event, { sid, oldPath, newPath }) => {
    return sftpRename(sid, oldPath, newPath);
  });

  ipcMain.handle("sftp-mkdir", (_event, { sid, remotePath }) => {
    return sftpMkdir(sid, remotePath);
  });

  // Direct upload from a known local path (used by drag-and-drop).
  ipcMain.handle("sftp-upload-path", async (_event, { sid, localPath, remotePath }) => {
    await sftpUpload(sid, localPath, remotePath);
    return { dest: remotePath };
  });

  ipcMain.handle("sftp-upload", async (event, { sid, remotePath }) => {
    const { BrowserWindow } = require("electron");
    const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
    const result = await dialog.showOpenDialog(win, {
      title: "Select File to Upload",
      properties: ["openFile"],
    });
    if (result.canceled) return { canceled: true };
    const localPath = result.filePaths[0];
    const filename = path.basename(localPath);
    const dest = remotePath.replace(/\/?$/, "/") + filename;
    await sftpUpload(sid, localPath, dest);
    return { dest };
  });
}

module.exports = { registerIpcHandlers };
