const fs = require("fs");
const os = require("os");
const { Client } = require("ssh2");
const { readConnections } = require("./connections");
const { decryptPassword } = require("./crypto");

let nextId = 1;
// sessionId → { client, stream, sftpClient, connectionId, type }
const sessions = new Map();

function genId() {
  return String(nextId++);
}

// Translates raw ssh2/Node errors into messages a non-expert can act on.
function friendlySshError(err) {
  const code = err.code;
  const level = err.level;
  if (code === "ECONNRESET")
    return "Connection reset by the server — make sure SSH is running on this host and port.";
  if (code === "ECONNREFUSED")
    return "Connection refused — no SSH server is listening on this port.";
  if (code === "ETIMEDOUT" || code === "ECONNABORTED")
    return "Connection timed out — check the hostname and your network.";
  if (code === "ENOTFOUND") return "Hostname not found — check the server address.";
  if (level === "client-authentication")
    return "Authentication failed — check your username and password / SSH key.";
  if (level === "client-timeout")
    return "SSH handshake timed out — the server may be unreachable or overloaded.";
  return err.message || String(err);
}

async function resolveConnection(connectionId) {
  const connections = await readConnections();
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) throw new Error("Connection not found");
  const password =
    decryptPassword(connection.encryptedPassword) || connection.password || undefined;
  return { connection, password };
}

function buildConnectConfig(connection, password) {
  const isCf = connection.protocol === "ssh-cf";
  const cfg = {
    host: isCf ? "127.0.0.1" : connection.hostname,
    port: connection.port || 22,
    username:
      (connection.username && connection.username.trim()) || os.userInfo().username,
    readyTimeout: 30000,
    keepaliveInterval: 15000,
  };
  if (connection.sshKeyPath && connection.sshKeyPath.trim()) {
    try {
      cfg.privateKey = fs.readFileSync(connection.sshKeyPath.trim());
    } catch {
      // Key file missing — fall through to password auth.
    }
  }
  if (password) cfg.password = password;
  return cfg;
}

// ─── Terminal (PTY shell) session ─────────────────────────────────────────────

function createTermSession(connectionId, cfg, onData, onClose) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const sid = genId();

    client.on("ready", () => {
      client.shell({ term: "xterm-256color", cols: 80, rows: 24 }, (err, stream) => {
        if (err) {
          client.end();
          reject(new Error(friendlySshError(err)));
          return;
        }
        sessions.set(sid, {
          client,
          stream,
          sftpClient: null,
          connectionId,
          type: "term",
        });
        stream.on("data", (d) => onData(sid, d));
        stream.stderr.on("data", (d) => onData(sid, d));
        stream.on("close", (code, signal) => {
          sessions.delete(sid);
          onClose(sid, code, signal);
          client.end();
        });
        resolve(sid);
      });
    });

    client.on("error", (err) => {
      sessions.delete(sid);
      try {
        client.destroy();
      } catch {}
      reject(new Error(friendlySshError(err)));
    });

    client.connect(cfg);
  });
}

async function sshCreateTerm(connectionId, onData, onClose) {
  const { connection, password } = await resolveConnection(connectionId);
  const cfg = buildConnectConfig(connection, password);
  return createTermSession(connectionId, cfg, onData, onClose);
}

// ─── SFTP session ─────────────────────────────────────────────────────────────

function createSftpSession(connectionId, cfg, onClose) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const sid = genId();

    client.on("ready", () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          reject(new Error(friendlySshError(err)));
          return;
        }
        sessions.set(sid, {
          client,
          stream: null,
          sftpClient: sftp,
          connectionId,
          type: "sftp",
        });
        client.on("close", () => {
          sessions.delete(sid);
          onClose(sid);
        });
        resolve(sid);
      });
    });

    client.on("error", (err) => {
      sessions.delete(sid);
      try {
        client.destroy();
      } catch {}
      reject(new Error(friendlySshError(err)));
    });

    client.connect(cfg);
  });
}

async function sshCreateSftp(connectionId, onClose) {
  const { connection, password } = await resolveConnection(connectionId);
  const cfg = buildConnectConfig(connection, password);
  return createSftpSession(connectionId, cfg, onClose);
}

// ─── Session operations ───────────────────────────────────────────────────────

function sshWrite(sid, data) {
  const s = sessions.get(sid);
  if (s && s.stream) s.stream.write(data);
}

function sshResize(sid, cols, rows) {
  const s = sessions.get(sid);
  if (s && s.stream) s.stream.setWindow(rows, cols, 0, 0);
}

function sshCloseSession(sid) {
  const s = sessions.get(sid);
  if (!s) return;
  try {
    if (s.stream) s.stream.end();
  } catch {}
  try {
    s.client.end();
  } catch {}
  sessions.delete(sid);
}

// ─── SFTP operations ──────────────────────────────────────────────────────────

function sftpList(sid, remotePath) {
  const s = sessions.get(sid);
  if (!s || !s.sftpClient) return Promise.reject(new Error("No SFTP session"));
  return new Promise((resolve, reject) => {
    s.sftpClient.readdir(remotePath, (err, list) => {
      if (err) {
        reject(err);
        return;
      }
      const entries = list
        .map((f) => ({
          name: f.filename,
          size: f.attrs.size,
          isDir: !!(f.attrs.mode & 0o040000),
          isSymlink: (f.attrs.mode & 0o170000) === 0o120000,
          mode: f.attrs.mode || 0,
          mtime: f.attrs.mtime * 1000,
        }))
        .filter((e) => e.name !== "." && e.name !== "..")
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      resolve(entries);
    });
  });
}

function sftpHome(sid) {
  const s = sessions.get(sid);
  if (!s || !s.sftpClient) return Promise.reject(new Error("No SFTP session"));
  return new Promise((resolve, reject) => {
    s.sftpClient.realpath(".", (err, p) => {
      if (err) reject(err);
      else resolve(p);
    });
  });
}

function sftpDownload(sid, remotePath, localPath) {
  const s = sessions.get(sid);
  if (!s || !s.sftpClient) return Promise.reject(new Error("No SFTP session"));
  return new Promise((resolve, reject) => {
    s.sftpClient.fastGet(remotePath, localPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function sftpUpload(sid, localPath, remotePath) {
  const s = sessions.get(sid);
  if (!s || !s.sftpClient) return Promise.reject(new Error("No SFTP session"));
  return new Promise((resolve, reject) => {
    s.sftpClient.fastPut(localPath, remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Close every open session that belongs to a given connectionId.
// Called when the user explicitly disconnects so stale SSH sessions don't linger.
function closeSessionsForConnection(connectionId) {
  for (const [sid, s] of sessions.entries()) {
    if (s.connectionId !== connectionId) continue;
    try {
      if (s.stream) s.stream.end();
    } catch {}
    try {
      s.client.end();
    } catch {}
    sessions.delete(sid);
  }
}

module.exports = {
  sshCreateTerm,
  sshCreateSftp,
  sshWrite,
  sshResize,
  sshCloseSession,
  closeSessionsForConnection,
  sftpList,
  sftpHome,
  sftpDownload,
  sftpUpload,
};
