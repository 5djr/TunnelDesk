const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Static value — renderer uses this to adapt platform-specific UI text.
  platform: process.platform,

  loadConnections: () => ipcRenderer.invoke("load-connections"),
  saveConnection: (connection) => ipcRenderer.invoke("save-connection", connection),
  deleteConnection: (id) => ipcRenderer.invoke("delete-connection", id),
  connect: (id) => ipcRenderer.invoke("connect", id),
  disconnect: (id) => ipcRenderer.invoke("disconnect", id),
  getStatuses: () => ipcRenderer.invoke("get-connection-statuses"),
  getTunnelStats: (id) => ipcRenderer.invoke("get-tunnel-stats", id),
  launchRdp: (id) => ipcRenderer.invoke("launch-rdp", id),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (s) => ipcRenderer.invoke("save-settings", s),
  pickFile: (opts) => ipcRenderer.invoke("pick-file", opts),
  openLogFolder: () => ipcRenderer.invoke("open-log-folder"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  openTermWindow: (connId, label) =>
    ipcRenderer.invoke("open-term-window", { connId, label }),
  openFormWindow: (connId) => ipcRenderer.invoke("open-form-window", { connId }),
  sshReportStatus: (connId, ok) =>
    ipcRenderer.invoke("ssh-report-status", { connId, ok }),
  // Replace any prior listener before adding so repeated calls don't accumulate.
  onStatusUpdate: (callback) => {
    ipcRenderer.removeAllListeners("status-update");
    ipcRenderer.on("status-update", (_, data) => callback(data));
  },
  onLog: (callback) => {
    ipcRenderer.removeAllListeners("connection-log");
    ipcRenderer.on("connection-log", (_, data) => callback(data));
  },
  onRdpClosed: (callback) => {
    ipcRenderer.removeAllListeners("rdp-closed");
    ipcRenderer.on("rdp-closed", (_, data) => callback(data));
  },
  onRdpReconnected: (callback) => {
    ipcRenderer.removeAllListeners("rdp-reconnected");
    ipcRenderer.on("rdp-reconnected", (_, data) => callback(data));
  },
  onDepsStatus: (callback) => {
    ipcRenderer.removeAllListeners("deps-status");
    ipcRenderer.on("deps-status", (_, data) => callback(data));
  },
  onAuthRequired: (callback) => {
    ipcRenderer.removeAllListeners("auth-required");
    ipcRenderer.on("auth-required", (_, data) => callback(data));
  },

  // ─── Telnet terminal ─────────────────────────────────────────────────────
  telnetTermCreate: (connectionId) =>
    ipcRenderer.invoke("telnet-term-create", connectionId),
  telnetWrite: (sid, data) => ipcRenderer.invoke("telnet-write", { sid, data }),
  telnetResize: (sid, cols, rows) =>
    ipcRenderer.invoke("telnet-resize", { sid, cols, rows }),
  telnetCloseSession: (sid) => ipcRenderer.invoke("telnet-close-session", sid),

  // ─── SSH terminal ────────────────────────────────────────────────────────
  sshTermCreate: (connectionId) => ipcRenderer.invoke("ssh-term-create", connectionId),
  sshSftpCreate: (connectionId) => ipcRenderer.invoke("ssh-sftp-create", connectionId),
  sshWrite: (sid, data) => ipcRenderer.invoke("ssh-write", { sid, data }),
  sshResize: (sid, cols, rows) => ipcRenderer.invoke("ssh-resize", { sid, cols, rows }),
  sshCloseSession: (sid) => ipcRenderer.invoke("ssh-close-session", sid),
  cancelSshConnect: (connId) => ipcRenderer.invoke("cancel-ssh-connect", connId),
  exportConnections: () => ipcRenderer.invoke("export-connections"),
  importConnections: () => ipcRenderer.invoke("import-connections"),
  showNotification: (title, body) =>
    ipcRenderer.invoke("show-notification", { title, body }),
  testHttp: (url) => ipcRenderer.invoke("test-http", { url }),
  deleteTempConnections: () => ipcRenderer.invoke("delete-temp-connections"),

  // ─── SFTP ────────────────────────────────────────────────────────────────
  sftpList: (sid, remotePath) => ipcRenderer.invoke("sftp-list", { sid, remotePath }),
  sftpHome: (sid) => ipcRenderer.invoke("sftp-home", sid),
  sftpDownload: (sid, remotePath) =>
    ipcRenderer.invoke("sftp-download", { sid, remotePath }),
  sftpUpload: (sid, remotePath) => ipcRenderer.invoke("sftp-upload", { sid, remotePath }),
  sftpUploadPath: (sid, localPath, remotePath) =>
    ipcRenderer.invoke("sftp-upload-path", { sid, localPath, remotePath }),
  sftpDelete: (sid, remotePath, isDir) =>
    ipcRenderer.invoke("sftp-delete", { sid, remotePath, isDir }),
  sftpRename: (sid, oldPath, newPath) =>
    ipcRenderer.invoke("sftp-rename", { sid, oldPath, newPath }),
  sftpMkdir: (sid, remotePath) => ipcRenderer.invoke("sftp-mkdir", { sid, remotePath }),

  // Push events — single dispatcher for all sessions, routed by sid in renderer.
  onSshData: (callback) => {
    ipcRenderer.removeAllListeners("ssh-data");
    ipcRenderer.on("ssh-data", (_, data) => callback(data));
  },
  onSshClose: (callback) => {
    ipcRenderer.removeAllListeners("ssh-close");
    ipcRenderer.on("ssh-close", (_, data) => callback(data));
  },
  onSshOsDetected: (callback) => {
    ipcRenderer.removeAllListeners("ssh-os-detected");
    ipcRenderer.on("ssh-os-detected", (_, data) => callback(data));
  },
  onConnectionSaved: (callback) => {
    ipcRenderer.removeAllListeners("connection-saved");
    ipcRenderer.on("connection-saved", () => callback());
  },
  onSettingsDidChange: (callback) => {
    ipcRenderer.removeAllListeners("settings-did-change");
    ipcRenderer.on("settings-did-change", (_, data) => callback(data));
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.removeAllListeners("update-available");
    ipcRenderer.on("update-available", (_, data) => callback(data));
  },
});
