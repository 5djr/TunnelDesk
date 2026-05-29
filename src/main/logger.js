const fs = require("fs");
const path = require("path");
const { state } = require("./state");
const { encryptFile } = require("./crypto");

const MAX_BYTES = 512 * 1024;
const MAX_ROTATED = 3;

let writeStream = null;
let currentSize = 0;
let ready = false;

function logFilePath(n = 0) {
  const base = path.join(state.userDataPath, "activity.log");
  return n === 0 ? base : `${base}.${n}`;
}

function openWriteStream() {
  try {
    writeStream = fs.createWriteStream(logFilePath(), { flags: "a", encoding: "utf8" });
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

function writeLog(id, message) {
  if (!writeStream) return;
  const plain = `${new Date().toISOString()}\t${id || ""}\t${message}`;
  // Each log entry is encrypted individually so the append stream is preserved.
  const line = encryptFile(plain) + "\n";
  try {
    writeStream.write(line);
    currentSize += Buffer.byteLength(line, "utf8");
    if (currentSize >= MAX_BYTES) rotateSync();
  } catch {}
}

function getLogFilePath() {
  return logFilePath();
}

function closeLogger() {
  if (writeStream) {
    try {
      writeStream.end();
    } catch {}
    writeStream = null;
  }
}

module.exports = { initLogger, writeLog, getLogFilePath, closeLogger };
