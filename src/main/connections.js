const fs = require("fs").promises;
const path = require("path");
const { state } = require("./state");
const { encryptPassword, encryptFile, decryptFile } = require("./crypto");
const { normalizePort, sanitizeProtocol } = require("./validation");

function configPath() {
  return path.join(state.userDataPath, "connections.json");
}

// In-memory cache — avoids disk read + DPAPI decryption on every IPC call.
// Invalidated by writeConnections so callers always see the latest data.
let _cache = null;

async function readConnections() {
  if (_cache !== null) return _cache.slice();
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const json = decryptFile(raw);
    if (json === null) {
      _cache = [];
      return [];
    }
    const parsed = JSON.parse(json);
    _cache = Array.isArray(parsed) ? parsed : [];
    return _cache.slice();
  } catch {
    _cache = [];
    return [];
  }
}

// Atomic write: write to a per-call temp file then rename so that concurrent
// saves don't clobber each other's temp file before the rename completes.
async function writeConnections(connections) {
  const file = configPath();
  const tmp = `${file}.tmp.${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // mode 0600: readable only by the owning user (rename preserves the mode).
  await fs.writeFile(tmp, encryptFile(JSON.stringify(connections, null, 2)), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  _cache = connections;
}

// One-time migration: convert any plain-text passwords to encrypted storage.
async function migratePasswords() {
  const { safeStorage } = require("electron");
  if (!safeStorage.isEncryptionAvailable()) return;
  const connections = await readConnections();
  let changed = false;
  for (const conn of connections) {
    if (conn.password && !conn.encryptedPassword) {
      conn.encryptedPassword = encryptPassword(conn.password);
      delete conn.password;
      changed = true;
    }
  }
  if (changed) await writeConnections(connections);
}

async function loadOrCreateConfig() {
  try {
    await fs.mkdir(state.userDataPath, { recursive: true });
  } catch {}
  try {
    await fs.access(configPath());
  } catch {
    await writeConnections([]);
  }
}

// Strips sensitive fields before sending a connection to the renderer.
function sanitizeForRenderer(conn) {
  return {
    id: conn.id,
    friendlyName: conn.friendlyName,
    hostname: conn.hostname,
    port: normalizePort(conn.port),
    username: conn.username,
    hasPassword: !!(conn.encryptedPassword || conn.password),
    protocol: sanitizeProtocol(conn.protocol),
    notes: conn.notes || "",
    group: conn.group || "",
    sshKeyPath: conn.sshKeyPath || "",
    hasSshKey: !!conn.sshKeyPath,
    hasSshKeyPassphrase: !!conn.encryptedSshKeyPassphrase,
    jumpHost: conn.jumpHost || "",
    jumpPort: conn.jumpPort ? normalizePort(conn.jumpPort) : null,
    temp: !!conn.temp,
    managed: !!conn.managed,
  };
}

module.exports = {
  readConnections,
  writeConnections,
  migratePasswords,
  loadOrCreateConfig,
  sanitizeForRenderer,
};
