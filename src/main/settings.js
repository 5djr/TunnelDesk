const fs = require("fs").promises;
const path = require("path");
const { state } = require("./state");

const DEFAULTS = {
  cloudflaredPath: "",
  defaultProtocol: "rdp-cf",
  minimizeToTray: true,
  startMinimized: false,
  logRetentionDays: 30,
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
    return { ...DEFAULTS, ...JSON.parse(raw) };
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
  const merged = { ...current, ...safe };
  const file = settingsPath();
  const tmp = `${file}.tmp.${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await fs.rename(tmp, file);
  return merged;
}

module.exports = { DEFAULTS, readSettings, writeSettings };
