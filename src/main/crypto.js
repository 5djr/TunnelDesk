const { safeStorage } = require("electron");

// ─── Password helpers (individual field encryption) ───────────────────────────

function encryptPassword(password) {
  if (!password || !safeStorage.isEncryptionAvailable()) return undefined;
  try {
    return safeStorage.encryptString(password).toString("base64");
  } catch {
    return undefined;
  }
}

function decryptPassword(encrypted) {
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    return undefined;
  }
}

// ─── File-level encryption ────────────────────────────────────────────────────
// Used to encrypt entire files (connections.json, settings.json, log lines).
// Prefix "ENC:" distinguishes encrypted content from legacy plaintext so that
// old files are transparently readable during migration.

const ENC_PREFIX = "ENC:";

function encryptFile(plaintext) {
  if (!safeStorage.isEncryptionAvailable()) return plaintext;
  try {
    return ENC_PREFIX + safeStorage.encryptString(plaintext).toString("base64");
  } catch {
    return plaintext;
  }
}

function decryptFile(raw) {
  if (!raw.startsWith(ENC_PREFIX)) return raw; // plaintext — migration path
  if (!safeStorage.isEncryptionAvailable()) return raw.slice(ENC_PREFIX.length);
  try {
    return safeStorage.decryptString(Buffer.from(raw.slice(ENC_PREFIX.length), "base64"));
  } catch {
    return null; // corrupted / wrong machine — caller must handle
  }
}

module.exports = { encryptPassword, decryptPassword, encryptFile, decryptFile };
