const { safeStorage } = require("electron");

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

module.exports = { encryptPassword, decryptPassword };
