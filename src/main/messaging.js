const { state, connectionStatuses } = require("./state");
const { writeLog } = require("./logger");

// Guards against the TOCTOU race where the window is destroyed between the
// null-check and the actual .send() call, which throws and crashes the process.
function safeSend(channel, data) {
  try {
    if (
      state.mainWindow &&
      !state.mainWindow.isDestroyed() &&
      state.mainWindow.webContents &&
      !state.mainWindow.webContents.isDestroyed()
    ) {
      state.mainWindow.webContents.send(channel, data);
    }
  } catch {
    // Window was destroyed between the checks — nothing to do.
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
