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
  const current = await readSettings();
  const merged = { ...current, ...partial };
  const tmp = settingsPath() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await fs.rename(tmp, settingsPath());
  return merged;
}

module.exports = { DEFAULTS, readSettings, writeSettings };
