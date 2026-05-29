const fs = require("fs").promises;
const path = require("path");
const { state } = require("./state");
const { encryptFile, decryptFile } = require("./crypto");

const DEFAULTS = {
  cloudflaredPath: "",
  defaultProtocol: "rdp-cf",
  minimizeToTray: true,
  startMinimized: false,
  logRetentionDays: 30,
  pinnedIds: [],
  sftpDownloadFolder: "",
  theme: "dark",
  connectionOrder: [],
  autoReconnect: true,
  autoReconnectAttempts: 3,
  osCache: {},
  osCacheDurationHours: 6,
};

const VALID_PROTOCOLS = new Set([
  "rdp-cf",
  "rdp",
  "ssh-cf",
  "ssh",
  "telnet",
  "http",
  "https",
]);

function settingsPath() {
  return path.join(state.userDataPath, "settings.json");
}

async function readSettings() {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    const json = decryptFile(raw);
    if (json === null) return { ...DEFAULTS }; // decryption failed
    return { ...DEFAULTS, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function writeSettings(partial) {
  if (!partial || typeof partial !== "object") return readSettings();
  const current = await readSettings();
  // Only accept known keys with validated types to prevent arbitrary key injection.
  const safe = {};
  if (typeof partial.cloudflaredPath === "string") {
    // Reject null bytes and shell metacharacters that could affect spawn().
    const p = partial.cloudflaredPath.trim();
    safe.cloudflaredPath = /[\x00<>|;&^`]/.test(p) ? "" : p.slice(0, 512);
  }
  if (VALID_PROTOCOLS.has(partial.defaultProtocol)) {
    safe.defaultProtocol = partial.defaultProtocol;
  }
  if (typeof partial.minimizeToTray === "boolean") {
    safe.minimizeToTray = partial.minimizeToTray;
  }
  if (typeof partial.startMinimized === "boolean") {
    safe.startMinimized = partial.startMinimized;
  }
  if (typeof partial.logRetentionDays === "number") {
    safe.logRetentionDays = Math.max(
      1,
      Math.min(365, Math.floor(partial.logRetentionDays)),
    );
  }
  if (Array.isArray(partial.pinnedIds)) {
    safe.pinnedIds = partial.pinnedIds.filter((x) => typeof x === "string").slice(0, 500);
  }
  if (typeof partial.sftpDownloadFolder === "string") {
    safe.sftpDownloadFolder = partial.sftpDownloadFolder.trim().slice(0, 512);
  }
  if (["dark", "light", "system"].includes(partial.theme)) {
    safe.theme = partial.theme;
  }
  if (Array.isArray(partial.connectionOrder)) {
    safe.connectionOrder = partial.connectionOrder
      .filter((x) => typeof x === "string")
      .slice(0, 2000);
  }
  if (typeof partial.autoReconnect === "boolean") {
    safe.autoReconnect = partial.autoReconnect;
  }
  if (typeof partial.autoReconnectAttempts === "number") {
    safe.autoReconnectAttempts = Math.max(
      1,
      Math.min(10, Math.floor(partial.autoReconnectAttempts)),
    );
  }
  if (partial.osCache && typeof partial.osCache === "object" && !Array.isArray(partial.osCache)) {
    const cleaned = {};
    for (const [k, v] of Object.entries(partial.osCache)) {
      if (v && typeof v.osInfo === "string" && typeof v.cachedAt === "number") {
        cleaned[k] = { osInfo: v.osInfo, cachedAt: v.cachedAt };
      }
    }
    safe.osCache = cleaned;
  }
  if (typeof partial.osCacheDurationHours === "number") {
    safe.osCacheDurationHours = Math.max(1, Math.min(168, Math.floor(partial.osCacheDurationHours)));
  }
  const merged = { ...current, ...safe };
  const file = settingsPath();
  const tmp = `${file}.tmp.${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, encryptFile(JSON.stringify(merged, null, 2)), "utf8");
  await fs.rename(tmp, file);
  return merged;
}

module.exports = { DEFAULTS, readSettings, writeSettings };
