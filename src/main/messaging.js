const { BrowserWindow } = require("electron");
const { connectionStatuses } = require("./state");
const { writeLog } = require("./logger");

// Broadcasts to every open window. Needed so terminal windows spawned from the
// main window also receive ssh-data, ssh-close, and status-update events.
function safeSend(channel, data) {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  } catch {
    // A window was destroyed between the check and the send — nothing to do.
  }
}

function sendConnectionLog(id, message) {
  safeSend("connection-log", { id, message });
  writeLog(id, message);
}

function updateStatus(id, status) {
  connectionStatuses.set(id, status);
  safeSend("status-update", { id, status });
}

module.exports = { safeSend, sendConnectionLog, updateStatus };
