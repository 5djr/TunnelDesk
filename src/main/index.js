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
const { checkForUpdate } = require("./updater");
const { startPolicyPolling } = require("./policy");
const { startSync } = require("./sync");
const { getAuthStatus } = require("./auth");

// ─── Chromium memory-reduction flags ─────────────────────────────────────────
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("enable-low-end-device-mode");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch(
  "disable-features",
  "TranslateUI,HardwareMediaKeyHandling,MediaSessionService",
);
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=64");

// Optional "Reduce GPU usage" mode (user setting). Disabling hardware
// acceleration removes the GPU process entirely — lower RAM and near-zero GPU
// usage on low-end / integrated-GPU machines. Must be decided before app.ready,
// so we read an unencrypted sidecar flag synchronously (see settings.js).
try {
  const fsSync = require("fs");
  const pathSync = require("path");
  const flag = pathSync.join(app.getPath("userData"), "reduce-gpu.flag");
  if (fsSync.existsSync(flag)) {
    app.disableHardwareAcceleration();
  }
} catch {
  // Non-critical: fall back to hardware acceleration enabled.
}

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
    // Remove any RDP credentials stored in Windows Credential Manager.
    const proto = active.connection && (active.connection.protocol || "rdp-cf");
    if (proto === "rdp-cf" || proto === "rdp") {
      try {
        const { deleteStoredCredential } = require("./rdp");
        const host = active.localHost ?? active.connection.hostname;
        deleteStoredCredential(host, active.localPort ?? active.connection.port);
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

    // Check for updates in the background; never blocks startup.
    checkForUpdate().then((update) => {
      if (update) safeSend("update-available", update);
    });

    // Read Group Policy first (may override sync URL / client ID).
    startPolicyPolling(5 * 60 * 1000, (policy) => {
      safeSend("policy-updated", policy);
    });
    const { getPolicy } = require("./policy");
    const policy = getPolicy();

    // Determine effective sync URL and interval (policy overrides user settings).
    const syncUrl = policy.configSyncUrl || settings.configSyncUrl || "";
    const syncInterval = policy.syncInterval || settings.configSyncInterval || 300;
    if (syncUrl) startSync(syncUrl, syncInterval);

    // Try to restore a saved Microsoft sign-in session silently.
    const clientId = policy.clientId || settings.entraClientId || "";
    const tenantId = policy.tenantId || settings.entraTenantId || "common";
    if (clientId) getAuthStatus(clientId, tenantId).catch(() => {});

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
