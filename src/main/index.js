const { app, dialog } = require("electron");
const { state, activeConnections, latencyHistory } = require("./state");
const { safeSend } = require("./messaging");
const { loadOrCreateConfig, migratePasswords } = require("./connections");
const { fetchCloudflaredVersion } = require("./system");
const { createWindow } = require("./window");
const { registerIpcHandlers } = require("./ipc");
const { readSettings } = require("./settings");
const { initLogger, closeLogger } = require("./logger");
const { createTray } = require("./tray");
const { connectById, disconnectById } = require("./actions");

// ─── Chromium memory-reduction flags ─────────────────────────────────────────
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("enable-low-end-device-mode");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch(
  "disable-features",
  "TranslateUI,HardwareMediaKeyHandling,MediaSessionService",
);
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=64");

// ─── Global error traps ───────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[TunnelDesk] Uncaught exception:", err);
  safeSend("connection-log", {
    message: `Internal error: ${err && err.message ? err.message : String(err)}`,
  });
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason ?? "unknown");
  console.error("[TunnelDesk] Unhandled rejection:", reason);
  safeSend("connection-log", { message: `Internal error: ${msg}` });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

app.on("before-quit", () => {
  const { spawnSync } = require("child_process");
  state.forceQuit = true;
  for (const [, active] of activeConnections) {
    if (active.mstscProc && active.mstscProc.exitCode === null) {
      try {
        active.mstscProc.kill();
      } catch {}
    }
    if (active.proc && !active.proc.killed) {
      try {
        active.proc.kill();
      } catch {}
    }
    // Remove any RDP credentials stored in Windows Credential Manager so they
    // don't persist after the app exits.
    const proto = active.connection && (active.connection.protocol || "rdp-cf");
    if (proto === "rdp-cf" || proto === "rdp") {
      const port = active.connection.port;
      try {
        spawnSync("cmdkey", [`/delete:TERMSRV/localhost:${port}`], {
          windowsHide: true,
          stdio: "ignore",
        });
        if (port === 3389) {
          spawnSync("cmdkey", ["/delete:TERMSRV/localhost"], {
            windowsHide: true,
            stdio: "ignore",
          });
        }
      } catch {}
    }
  }
  activeConnections.clear();
  latencyHistory.clear();
  closeLogger();
});

app.whenReady().then(async () => {
  try {
    state.userDataPath = app.getPath("userData");
    await loadOrCreateConfig();
    await migratePasswords();
    initLogger();
    state.cloudflaredVersion = await fetchCloudflaredVersion();
    registerIpcHandlers();

    const settings = await readSettings();
    state.trayEnabled = settings.minimizeToTray;
    state.startMinimized = settings.startMinimized;

    createWindow();

    if (settings.minimizeToTray) {
      createTray(
        (id) => connectById(id),
        (id) => disconnectById(id),
      );
    }
  } catch (err) {
    dialog.showErrorBox(
      "TunnelDesk failed to start",
      `Startup error: ${err && err.message ? err.message : String(err)}\n\nThe application will now close.`,
    );
    app.exit(1);
    return;
  }

  app.on("activate", () => {
    const { BrowserWindow } = require("electron");
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // When tray is enabled the app lives in the system tray — don't quit on window close.
  if (process.platform !== "darwin" && !state.trayEnabled) {
    app.quit();
  }
});
