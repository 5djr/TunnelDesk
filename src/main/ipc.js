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

// Cache network interfaces — they change rarely and os.networkInterfaces() is
// called on every debug-stats poll (every 2 s while a connection is open).
let _netIfsCache = null;
let _netIfsCachedAt = 0;
const NET_IFS_TTL = 30000;

function getCachedNetworkInterfaces() {
  const now = Date.now();
  if (_netIfsCache && now - _netIfsCachedAt < NET_IFS_TTL) return _netIfsCache;
  _netIfsCache = os.networkInterfaces();
  _netIfsCachedAt = now;
  return _netIfsCache;
}

// Coerce IPC-supplied identifiers to a bounded string.
// Prevents null/object/array inputs from bypassing Map lookups or causing
// unexpected behaviour in downstream string operations.
function toId(value, maxLen = 256) {
  if (value == null) return "";
  return String(value).slice(0, maxLen);
}

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
      if (String(connection.password).length > 1024) {
        throw new Error("Password must be 1024 characters or fewer");
      }
      encryptedPassword = encryptPassword(String(connection.password));
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
      if (String(connection.sshKeyPassphrase).length > 1024) {
        throw new Error("SSH key passphrase must be 1024 characters or fewer");
      }
      encryptedSshKeyPassphrase = encryptPassword(String(connection.sshKeyPassphrase));
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
    const jumpHost = sanitizeHostname(connection.jumpHost || "");
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
      jumpHost: jumpHost || undefined,
      jumpPort: jumpHost ? normalizePort(connection.jumpPort || 22) : undefined,
      temp: !!connection.temp,
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
    const id = toId(connectionId);
    const connections = await readConnections();
    const remaining = connections.filter((item) => item.id !== id);
    await writeConnections(remaining);
    await stopConnection(id);
    updateTrayMenu();
    return remaining.map(sanitizeForRenderer);
  });

  ipcMain.handle("connect", async (event, connectionId) => {
    const id = toId(connectionId);
    try {
      const result = await connectById(id);
      updateTrayMenu();
      return result;
    } catch (error) {
      updateStatus(id, "disconnected");
      sendConnectionLog(
        id,
        (error instanceof Error ? error.message : String(error)) || "Connection failed",
      );
      updateTrayMenu();
      throw error;
    }
  });

  ipcMain.handle("disconnect", async (event, connectionId) => {
    const result = await disconnectById(toId(connectionId));
    updateTrayMenu();
    return result;
  });

  ipcMain.handle("launch-rdp", async (event, connectionId) => {
    const { launchRemoteDesktop } = require("./rdp");
    const id = toId(connectionId);
    const active = activeConnections.get(id);
    if (!active || !isProcessAlive(active.proc)) {
      throw new Error("Cloudflare tunnel is not active — connect first");
    }
    await launchRemoteDesktop(
      active.localPort ?? active.connection.port,
      id,
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
    const active = activeConnections.get(toId(connectionId));
    if (!active) return null;

    const { proc, connection, connectedAt } = active;
    const protocol = connection.protocol || "rdp-cf";
    const isCfTunnel = protocol === "rdp-cf" || protocol === "ssh-cf";
    const isRdpProto = protocol === "rdp-cf" || protocol === "rdp";

    const alive = isCfTunnel ? isProcessAlive(proc) : true;
    const pid = proc ? proc.pid : null;
    const uptime = connectedAt ? Math.floor((Date.now() - connectedAt) / 1000) : null;

    const measureHost = isCfTunnel ? "127.0.0.1" : connection.hostname;
    // CF tunnels listen on a dynamically allocated loopback port; fall back to
    // the configured port for direct connections.
    const localPort = isCfTunnel
      ? (active.localPort ?? connection.port)
      : connection.port;

    const [latency, cloudflaredMemBytes, mstscMemBytes] = await Promise.all([
      alive
        ? measureRoundTripLatency(measureHost, localPort, protocol)
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

    const localIps = Object.entries(getCachedNetworkInterfaces()).flatMap(
      ([name, addrs]) =>
        (addrs || [])
          .filter((a) => !a.internal && a.family === "IPv4")
          .map((a) => ({ name, address: a.address })),
    );

    return {
      pid,
      localEndpoint: isCfTunnel
        ? `localhost:${localPort}`
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
    const prev = await readSettings();
    const result = await writeSettings(partial);
    safeSend("settings-did-change", result);
    // Restart sync if the URL changed.
    if (result.configSyncUrl !== prev.configSyncUrl) {
      const { startSync, stopSync } = require("./sync");
      const { getPolicy } = require("./policy");
      const policy = getPolicy();
      const syncUrl = policy.configSyncUrl || result.configSyncUrl;
      const syncInterval = policy.syncInterval || result.configSyncInterval || 300;
      if (syncUrl) startSync(syncUrl, syncInterval);
      else stopSync();
    }
    return result;
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

  ipcMain.handle("open-qc-window", () => {
    const { createQuickConnectWindow } = require("./window");
    createQuickConnectWindow();
    return { status: "opened" };
  });

  const pendingConfirms = new Map();

  ipcMain.handle("open-confirm-window", (_event, { message }) => {
    const { createConfirmWindow } = require("./window");
    const win = createConfirmWindow(String(message).slice(0, 512));
    return new Promise((resolve) => {
      pendingConfirms.set(win.id, resolve);
      win.once("closed", () => {
        if (pendingConfirms.has(win.id)) {
          pendingConfirms.get(win.id)(false);
          pendingConfirms.delete(win.id);
        }
      });
    });
  });

  ipcMain.handle("confirm-result", (event, result) => {
    const { BrowserWindow } = require("electron");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && pendingConfirms.has(win.id)) {
      pendingConfirms.get(win.id)(!!result);
      pendingConfirms.delete(win.id);
    }
    try {
      win?.close();
    } catch {}
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
    const id = toId(connId);
    if (ok) {
      const entry = activeConnections.get(id);
      // Guard: only accept the first success report — a stale sshReportStatus(true)
      // from an old terminal window must not stamp a freshly-reconnecting session.
      if (entry && entry.connectedAt === null) {
        entry.connectedAt = Date.now();
        updateStatus(id, "connected");
      }
    } else {
      const wasConnected = connectionStatuses.get(id) === "connected";
      activeConnections.delete(id);
      updateStatus(id, "disconnected");
      if (!wasConnected) sendConnectionLog(id, "Connection failed.");
    }
  });

  // ─── SSH terminal ──────────────────────────────────────────────────────────

  // ─── Telnet terminal ──────────────────────────────────────────────────────
  // Reuses the same ssh-data / ssh-close renderer events so the terminal tab
  // system works identically to SSH — routing is done via the sid Map.

  ipcMain.handle("telnet-term-create", async (_event, connectionId) => {
    return telnetCreateTerm(
      toId(connectionId),
      (id, data) =>
        safeSend("ssh-data", { sid: id, data: Buffer.from(data).toString("base64") }),
      (id) => safeSend("ssh-close", { sid: id, code: null, signal: null }),
    );
  });

  ipcMain.handle("telnet-write", (_event, { sid, data }) => {
    telnetWrite(toId(sid), data);
  });

  ipcMain.handle("telnet-resize", (_event, { sid, cols, rows }) => {
    telnetResize(toId(sid), cols, rows);
  });

  ipcMain.handle("telnet-close-session", (_event, sid) => {
    telnetCloseSession(toId(sid));
  });

  // ─── SSH terminal ──────────────────────────────────────────────────────────

  ipcMain.handle("ssh-term-create", async (_event, connectionId) => {
    const sid = await sshCreateTerm(
      toId(connectionId),
      (id, data) =>
        safeSend("ssh-data", { sid: id, data: Buffer.from(data).toString("base64") }),
      (id, code, signal) => safeSend("ssh-close", { sid: id, code, signal }),
      (id, osInfo) => safeSend("ssh-os-detected", { sid: id, osInfo }),
    );
    return sid;
  });

  ipcMain.handle("ssh-sftp-create", async (_event, connectionId) => {
    return sshCreateSftp(toId(connectionId), (id) =>
      safeSend("ssh-close", { sid: id, code: null, signal: null }),
    );
  });

  ipcMain.handle("ssh-write", (_event, { sid, data }) => {
    sshWrite(toId(sid), data);
  });

  ipcMain.handle("ssh-resize", (_event, { sid, cols, rows }) => {
    sshResize(toId(sid), cols, rows);
  });

  ipcMain.handle("ssh-close-session", (_event, sid) => {
    sshCloseSession(toId(sid));
  });

  ipcMain.handle("cancel-ssh-connect", (_event, connectionId) => {
    cancelPendingConnections(toId(connectionId));
  });

  // ─── SFTP operations ───────────────────────────────────────────────────────

  ipcMain.handle("sftp-list", (_event, { sid, remotePath }) => {
    return sftpList(toId(sid), remotePath);
  });

  ipcMain.handle("sftp-home", (_event, sid) => {
    return sftpHome(toId(sid));
  });

  ipcMain.handle("sftp-download", async (event, { sid, remotePath }) => {
    const { BrowserWindow } = require("electron");
    const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
    // Derive the suggested filename safely: coerce to string and strip any
    // directory components a malicious server listing may embed in the name.
    const filename = path.basename(String(remotePath).split("/").pop() || "file");
    const settings = await readSettings();
    const defaultPath = settings.sftpDownloadFolder
      ? path.join(settings.sftpDownloadFolder, filename)
      : filename;
    const result = await dialog.showSaveDialog(win, { title: "Save File", defaultPath });
    if (result.canceled) return { canceled: true };
    await sftpDownload(toId(sid), remotePath, result.filePath);
    return { filePath: result.filePath };
  });

  ipcMain.handle("export-connections", async (event) => {
    const { BrowserWindow } = require("electron");
    const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
    const result = await dialog.showSaveDialog(win, {
      title: "Export Connections",
      defaultPath: "tunneldesk-connections.json",
      filters: [{ name: "JSON Files", extensions: ["json"] }],
    });
    if (result.canceled) return { canceled: true };
    const conns = await readConnections();
    // Strip encrypted credential fields — they're DPAPI-bound to this machine.
    const exported = conns.map(
      // eslint-disable-next-line no-unused-vars
      ({ encryptedPassword, encryptedSshKeyPassphrase, ...rest }) => rest,
    );
    const fsP = require("fs").promises;
    await fsP.writeFile(result.filePath, JSON.stringify(exported, null, 2), "utf8");
    return { count: exported.length };
  });

  ipcMain.handle("import-connections", async (event) => {
    const { BrowserWindow } = require("electron");
    const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
    const result = await dialog.showOpenDialog(win, {
      title: "Import Connections",
      filters: [{ name: "JSON Files", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const fsP = require("fs").promises;
    let parsed;
    try {
      parsed = JSON.parse(await fsP.readFile(result.filePaths[0], "utf8"));
    } catch {
      throw new Error(
        "Could not read the file — make sure it is a valid TunnelDesk export.",
      );
    }
    if (!Array.isArray(parsed)) throw new Error("Invalid file format.");
    const existing = await readConnections();
    const existingIds = new Set(existing.map((c) => c.id));
    let added = 0;
    for (const conn of parsed) {
      const hostname = sanitizeHostname(conn.hostname);
      if (!hostname) continue;
      const id =
        conn.id && typeof conn.id === "string" && !existingIds.has(conn.id)
          ? conn.id
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const jumpHost = sanitizeHostname(conn.jumpHost || "");
      existing.push({
        id,
        friendlyName: String(conn.friendlyName || hostname)
          .trim()
          .slice(0, 128),
        hostname,
        port: normalizePort(conn.port || 3389),
        username: sanitizeUsername(conn.username),
        protocol: sanitizeProtocol(conn.protocol),
        notes: sanitizeNotes(conn.notes),
        group: sanitizeGroup(conn.group),
        sshKeyPath: sanitizePath(conn.sshKeyPath),
        jumpHost: jumpHost || undefined,
        jumpPort: jumpHost ? normalizePort(conn.jumpPort || 22) : undefined,
      });
      existingIds.add(id);
      added++;
    }
    await writeConnections(existing);
    safeSend("connection-saved");
    return { added };
  });

  ipcMain.handle("sftp-delete", (_event, { sid, remotePath, isDir }) => {
    return sftpDelete(toId(sid), remotePath, !!isDir);
  });

  ipcMain.handle("sftp-rename", (_event, { sid, oldPath, newPath }) => {
    return sftpRename(toId(sid), oldPath, newPath);
  });

  ipcMain.handle("sftp-mkdir", (_event, { sid, remotePath }) => {
    return sftpMkdir(toId(sid), remotePath);
  });

  // Direct upload from a known local path (used by drag-and-drop). The path is
  // renderer-supplied, so validate it points at a real regular file before
  // reading it — this prevents a compromised renderer from exfiltrating
  // arbitrary local files (keys, config) to a connected SSH host.
  ipcMain.handle("sftp-upload-path", async (_event, { sid, localPath, remotePath }) => {
    if (typeof localPath !== "string" || localPath.includes("\x00")) {
      throw new Error("Invalid local path");
    }
    const stat = await require("fs").promises.stat(localPath);
    if (!stat.isFile()) {
      throw new Error("Only regular files can be uploaded");
    }
    await sftpUpload(toId(sid), localPath, remotePath);
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
    await sftpUpload(toId(sid), localPath, dest);
    return { dest };
  });

  ipcMain.handle("show-notification", (_event, { title, body }) => {
    const { Notification } = require("electron");
    if (Notification.isSupported()) {
      new Notification({
        title: String(title || "TunnelDesk").slice(0, 128),
        body: String(body || "").slice(0, 256),
        silent: true,
      }).show();
    }
  });

  ipcMain.handle("test-http", async (_event, { url }) => {
    const { URL: NodeURL } = require("url");
    let parsed;
    try {
      parsed = new NodeURL(url);
    } catch {
      throw new Error("Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error("Only http and https are supported");

    const doRequest = (targetUrl, start, redirectsLeft) =>
      new Promise((resolve) => {
        let target;
        try {
          target = new NodeURL(targetUrl);
        } catch {
          resolve({
            statusCode: null,
            timeMs: Date.now() - start,
            error: "Invalid redirect URL",
          });
          return;
        }
        const mod = target.protocol === "https:" ? require("https") : require("http");
        const req = mod.request(
          {
            hostname: target.hostname,
            port: target.port || undefined,
            path: (target.pathname || "/") + (target.search || ""),
            method: "HEAD",
            timeout: 8000,
            rejectUnauthorized: false, // allow self-signed certs for testing
          },
          (res) => {
            const status = res.statusCode;
            res.resume();
            if (
              redirectsLeft > 0 &&
              status >= 300 &&
              status < 400 &&
              res.headers.location
            ) {
              // Follow one redirect
              resolve(doRequest(res.headers.location, start, redirectsLeft - 1));
            } else {
              resolve({ statusCode: status, timeMs: Date.now() - start });
            }
          },
        );
        req.on("timeout", () => {
          req.destroy();
          resolve({ statusCode: null, timeMs: Date.now() - start, error: "Timeout" });
        });
        req.on("error", (e) =>
          resolve({ statusCode: null, timeMs: Date.now() - start, error: e.message }),
        );
        req.end();
      });

    return doRequest(url, Date.now(), 1);
  });

  ipcMain.handle("delete-temp-connections", async () => {
    const connections = await readConnections();
    const remaining = connections.filter((c) => !c.temp);
    if (remaining.length !== connections.length) {
      await writeConnections(remaining);
      updateTrayMenu();
    }
  });

  // ─── Entra ID / MSAL auth ─────────────────────────────────────────────────

  ipcMain.handle("auth-sign-in", async (_event, { clientId, tenantId }) => {
    const { signIn } = require("./auth");
    return signIn(String(clientId || "").trim(), String(tenantId || "common").trim());
  });

  ipcMain.handle("auth-sign-out", async () => {
    const { signOut } = require("./auth");
    return signOut();
  });

  ipcMain.handle("auth-get-status", async () => {
    const { getAuthStatus } = require("./auth");
    const settings = await readSettings();
    const { getPolicy } = require("./policy");
    const policy = getPolicy();
    const clientId = policy.clientId || settings.entraClientId || "";
    const tenantId = policy.tenantId || settings.entraTenantId || "common";
    return getAuthStatus(clientId, tenantId);
  });

  // ─── Config sync ─────────────────────────────────────────────────────────

  ipcMain.handle("sync-fetch-now", async () => {
    const { fetchAndApply } = require("./sync");
    const { getPolicy } = require("./policy");
    const settings = await readSettings();
    const policy = getPolicy();
    const url = policy.configSyncUrl || settings.configSyncUrl || "";
    if (!url) throw new Error("No sync URL configured");
    const result = await fetchAndApply(url);
    return { count: result.connections.length };
  });

  ipcMain.handle("get-managed-connections", () => {
    const { getManagedConnections } = require("./sync");
    return getManagedConnections();
  });

  ipcMain.handle("get-sync-status", () => {
    const { getSyncStatus } = require("./sync");
    return getSyncStatus();
  });

  ipcMain.handle("get-policy", () => {
    const { getPolicy } = require("./policy");
    return getPolicy();
  });
}

module.exports = { registerIpcHandlers };
