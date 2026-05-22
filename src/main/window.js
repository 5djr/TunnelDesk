const path = require("path");
const { BrowserWindow } = require("electron");
const { state } = require("./state");
const { safeSend } = require("./messaging");
const { checkDependencies } = require("./system");

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
  win.once("ready-to-show", () => win.show());
  return win;
}

module.exports = { createWindow, createTerminalWindow };
