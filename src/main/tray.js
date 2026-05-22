const path = require("path");
const { app, Tray, Menu } = require("electron");
const { state, connectionStatuses } = require("./state");
const { readConnections } = require("./connections");

let tray = null;
let _connectFn = null;
let _disconnectFn = null;

function showWindow() {
  const win = state.mainWindow;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function rebuildMenu() {
  if (!tray) return;
  let connections = [];
  try {
    connections = await readConnections();
  } catch {}

  const tunnelItems = connections.map((conn) => {
    const status = connectionStatuses.get(conn.id) || "disconnected";
    const isConnected = status === "connected";
    const isConnecting = status === "connecting";
    const label = conn.friendlyName || conn.hostname;
    const prefix = isConnected ? "● " : isConnecting ? "◌ " : "○ ";
    return {
      label: prefix + label,
      enabled: !isConnecting,
      click: async () => {
        try {
          if (isConnected) {
            if (_disconnectFn) await _disconnectFn(conn.id);
          } else {
            if (_connectFn) await _connectFn(conn.id);
          }
        } catch {}
        rebuildMenu();
      },
    };
  });

  const menu = Menu.buildFromTemplate([
    { label: "TunnelDesk", enabled: false },
    { type: "separator" },
    ...(tunnelItems.length > 0
      ? tunnelItems
      : [{ label: "No tunnels configured", enabled: false }]),
    { type: "separator" },
    { label: "Open TunnelDesk", click: showWindow },
    { type: "separator" },
    {
      label: "Quit TunnelDesk",
      click: () => {
        state.forceQuit = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

function createTray(connectFn, disconnectFn) {
  _connectFn = connectFn;
  _disconnectFn = disconnectFn;
  const iconPath = path.join(__dirname, "..", "..", "assets", "icon.ico");
  tray = new Tray(iconPath);
  tray.setToolTip("TunnelDesk");
  tray.on("double-click", showWindow);
  rebuildMenu();
  return tray;
}

function updateTrayMenu() {
  rebuildMenu();
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, updateTrayMenu, destroyTray, showWindow };
