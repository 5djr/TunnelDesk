const path = require("path");
const { app, BrowserWindow, Menu } = require("electron");
const { state } = require("./state");
const { safeSend } = require("./messaging");
const { checkDependencies } = require("./system");

// On macOS a minimal application menu is required for standard keyboard shortcuts
// (Cmd+C/V/X, Cmd+Q, Cmd+W, Cmd+M, etc.) to work correctly.
if (process.platform === "darwin") {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.getName(),
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ],
      },
    ]),
  );
}

const isDev = !app.isPackaged;

function attachDevTools(win) {
  if (!isDev) return;
  win.once("ready-to-show", () => {
    win.webContents.openDevTools({ mode: "detach" });
  });
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      win.webContents.toggleDevTools();
    }
  });
}

function createWindow() {
  state.mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 760,
    minHeight: 620,
    resizable: true,
    show: false,
    backgroundColor: "#1b1b1b",
    icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  state.mainWindow.loadFile(
    path.join(__dirname, "..", "..", "dist", "renderer", "index.html"),
  );
  state.mainWindow.setMenuBarVisibility(false);
  state.mainWindow.setMenu(null);

  attachDevTools(state.mainWindow);

  state.mainWindow.once("ready-to-show", async () => {
    if (!state.startMinimized) {
      state.mainWindow.show();
    }
    try {
      const deps = await checkDependencies();
      safeSend("deps-status", deps);
    } catch {
      // Non-critical; app works fine without the dependency banner.
    }
  });

  // When minimizeToTray is enabled, hide instead of closing.
  state.mainWindow.on("close", (event) => {
    if (!state.forceQuit && state.trayEnabled) {
      event.preventDefault();
      state.mainWindow.hide();
    }
  });

  state.mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[TunnelDesk] Renderer process gone:", details.reason);
    if (details.reason !== "clean-exit") {
      try {
        state.mainWindow.loadFile(
          path.join(__dirname, "..", "..", "dist", "renderer", "index.html"),
        );
      } catch {}
    }
  });

  state.mainWindow.webContents.on("unresponsive", () => {
    console.error("[TunnelDesk] Renderer became unresponsive");
  });

  state.mainWindow.on("closed", () => {
    state.mainWindow = null;
  });
}

function createTerminalWindow(connId, label) {
  const win = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 600,
    minHeight: 400,
    resizable: true,
    show: false,
    backgroundColor: "#1b1b1b",
    title: label ? `${label} — Terminal` : "Terminal",
    icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "..", "dist", "renderer", "index.html"), {
    query: { mode: "terminal", connId },
  });
  win.setMenuBarVisibility(false);
  win.setMenu(null);
  attachDevTools(win);
  win.once("ready-to-show", () => win.show());
  return win;
}

function createFormWindow(connId) {
  const query = { mode: "form" };
  if (connId) query.connId = connId;

  const win = new BrowserWindow({
    width: 480,
    height: 700,
    minWidth: 400,
    minHeight: 560,
    resizable: true,
    show: false,
    frame: false,
    backgroundColor: "#1b1b1b",
    icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "..", "dist", "renderer", "index.html"), {
    query,
  });
  win.setMenuBarVisibility(false);
  win.setMenu(null);
  attachDevTools(win);
  win.once("ready-to-show", () => win.show());
  return win;
}

function createQuickConnectWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 330,
    resizable: false,
    show: false,
    frame: false,
    backgroundColor: "#1b1b1b",
    icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "..", "dist", "renderer", "index.html"), {
    query: { mode: "qc" },
  });
  win.setMenuBarVisibility(false);
  win.setMenu(null);
  attachDevTools(win);
  win.once("ready-to-show", () => win.show());
  return win;
}

function createConfirmWindow(message) {
  const win = new BrowserWindow({
    width: 400,
    height: 210,
    resizable: false,
    show: false,
    frame: false,
    backgroundColor: "#1b1b1b",
    icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "..", "dist", "renderer", "index.html"), {
    query: { mode: "confirm", message },
  });
  win.setMenuBarVisibility(false);
  win.setMenu(null);
  attachDevTools(win);
  win.once("ready-to-show", () => win.show());
  return win;
}

module.exports = {
  createWindow,
  createTerminalWindow,
  createFormWindow,
  createQuickConnectWindow,
  createConfirmWindow,
};
