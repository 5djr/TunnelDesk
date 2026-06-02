const fs = require("fs");
const path = require("path");
const { state } = require("./state");
const { encryptFile } = require("./crypto");

const MAX_BYTES = 512 * 1024;
const MAX_ROTATED = 3;

let writeStream = null;
let currentSize = 0;
let ready = false;

// Buffered writes — accumulate log lines and flush them as a single encrypted
// block every 500 ms instead of calling safeStorage.encryptString per line.
let _writeBuf = [];
let _flushTimer = null;

function logFilePath(n = 0) {
  const base = path.join(state.userDataPath, "activity.log");
  return n === 0 ? base : `${base}.${n}`;
}

function openWriteStream() {
  try {
    writeStream = fs.createWriteStream(logFilePath(), {
      flags: "a",
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {}
}

function rotateSync() {
  if (writeStream) {
    writeStream.destroy();
    writeStream = null;
  }
  for (let i = MAX_ROTATED; i >= 1; i--) {
    try {
      fs.renameSync(logFilePath(i), logFilePath(i + 1));
    } catch {}
  }
  try {
    fs.renameSync(logFilePath(), logFilePath(1));
  } catch {}
  currentSize = 0;
  openWriteStream();
}

function initLogger() {
  if (!state.userDataPath || ready) return;
  ready = true;
  try {
    const stat = fs.statSync(logFilePath());
    currentSize = stat.size;
    if (currentSize >= MAX_BYTES) {
      rotateSync();
      return;
    }
  } catch {
    currentSize = 0;
  }
  openWriteStream();
}

function flushLog() {
  _flushTimer = null;
  if (!writeStream || _writeBuf.length === 0) return;
  const lines = _writeBuf.splice(0);
  // Encrypt the batch as a single block — one safeStorage call for many lines.
  const block = encryptFile(lines.join("\n")) + "\n";
  try {
    writeStream.write(block);
    currentSize += Buffer.byteLength(block, "utf8");
    if (currentSize >= MAX_BYTES) rotateSync();
  } catch {}
}

function writeLog(id, message) {
  if (!writeStream) return;
  _writeBuf.push(`${new Date().toISOString()}\t${id || ""}\t${message}`);
  if (!_flushTimer) {
    _flushTimer = setTimeout(flushLog, 500);
  }
}

function getLogFilePath() {
  return logFilePath();
}

function closeLogger() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  flushLog(); // flush any pending entries before closing
  if (writeStream) {
    try {
      writeStream.end();
    } catch {}
    writeStream = null;
  }
}

module.exports = { initLogger, writeLog, getLogFilePath, closeLogger };
