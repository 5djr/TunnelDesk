const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
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
  onDepsStatus: (callback) => {
    ipcRenderer.removeAllListeners("deps-status");
    ipcRenderer.on("deps-status", (_, data) => callback(data));
  },
  onAuthRequired: (callback) => {
    ipcRenderer.removeAllListeners("auth-required");
    ipcRenderer.on("auth-required", (_, data) => callback(data));
  },
});
