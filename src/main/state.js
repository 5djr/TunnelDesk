// Shared mutable state — imported as a reference so mutations are visible
// across every module that imports this object.

const state = {
  mainWindow: /** @type {import("electron").BrowserWindow | null} */ (null),
  userDataPath: /** @type {string | null} */ (null),
  cloudflaredVersion: /** @type {string | null} */ (null),
  forceQuit: false,
  trayEnabled: false,
};

const activeConnections = new Map();
const connectionStatuses = new Map();
const latencyHistory = new Map();

module.exports = { state, activeConnections, connectionStatuses, latencyHistory };
