const fs = require("fs");
const os = require("os");
const { Client } = require("ssh2");
const { readConnections } = require("./connections");
const { decryptPassword } = require("./crypto");

let nextId = 1;
// sessionId → { client, stream, sftpClient, connectionId, type }
const sessions = new Map();
// connectionId → Set<Client> for clients currently in the TCP/SSH handshake phase.
// Allows cancelling an in-progress connection before it reaches "ready".
const pendingClients = new Map();

function genId() {
  return String(nextId++);
}

// Translates raw ssh2/Node errors into messages a non-expert can act on.
function friendlySshError(err) {
  const code = err.code;
  const level = err.level;
  const msg = err.message || String(err);
  if (code === "ECONNRESET")
    return "Connection reset by the server — make sure SSH is running on this host and port.";
  if (code === "ECONNREFUSED")
    return "Connection refused — no SSH server is listening on this port.";
  if (code === "ETIMEDOUT" || code === "ECONNABORTED")
    return "Connection timed out — check the hostname and your network.";
  if (code === "ENOTFOUND") return "Hostname not found — check the server address.";
  if (level === "client-authentication")
    return "Authentication failed — the server rejected your credentials. Verify your username, password, or SSH key.";
  if (level === "client-timeout")
    return "SSH handshake timed out — the server may be unreachable or overloaded.";
  if (/passphrase|encrypted key/i.test(msg))
    return "SSH key is passphrase-protected — add the key passphrase in the connection settings.";
  return msg;
}

async function resolveConnection(connectionId) {
  const connections = await readConnections();
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) throw new Error("Connection not found");
  const password =
    decryptPassword(connection.encryptedPassword) || connection.password || undefined;
  const keyPassphrase =
    decryptPassword(connection.encryptedSshKeyPassphrase) || undefined;
  return { connection, password, keyPassphrase };
}

function buildConnectConfig(connection, password, keyPassphrase) {
  const isCf = connection.protocol === "ssh-cf";
  const cfg = {
    host: isCf ? "127.0.0.1" : connection.hostname,
    port: connection.port || 22,
    username:
      (connection.username && connection.username.trim()) || os.userInfo().username,
    readyTimeout: 30000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 5,
    // Allow keyboard-interactive so servers that send a PAM/password prompt
    // after the TCP handshake (instead of accepting password in the auth step)
    // are handled automatically.
    tryKeyboard: true,
  };
  if (connection.sshKeyPath && connection.sshKeyPath.trim()) {
    try {
      cfg.privateKey = fs.readFileSync(connection.sshKeyPath.trim());
      if (keyPassphrase) cfg.passphrase = keyPassphrase;
    } catch {
      cfg._keyMissing = true; // key path configured but file unreadable
    }
  }
  if (password) cfg.password = password;
  return cfg;
}

// ─── Terminal (PTY shell) session ─────────────────────────────────────────────

function trackPending(connectionId, client) {
  if (!pendingClients.has(connectionId)) pendingClients.set(connectionId, new Set());
  pendingClients.get(connectionId).add(client);
}

function untrackPending(connectionId, client) {
  const s = pendingClients.get(connectionId);
  if (!s) return;
  s.delete(client);
  if (s.size === 0) pendingClients.delete(connectionId);
}

function cancelPendingConnections(connectionId) {
  const s = pendingClients.get(connectionId);
  if (!s) return;
  for (const client of s) {
    try {
      client.destroy();
    } catch {}
  }
  pendingClients.delete(connectionId);
}

// Detect the remote OS by running a quick non-interactive exec. Runs concurrently
// with the PTY shell open so it adds no noticeable latency.
function detectOsInfo(client) {
  return new Promise((resolve) => {
    let execStream = null;
    const done = setTimeout(() => {
      resolve("unknown");
      if (execStream) {
        try {
          execStream.destroy();
        } catch {}
      }
    }, 2000);
    // sed correctly strips the literal ID= prefix and surrounding quotes
    const cmd =
      "uname -s 2>/dev/null; cat /etc/os-release 2>/dev/null | grep -m1 '^ID=' | sed 's/^ID=//;s/\"//g'";
    client.exec(cmd, (err, stream) => {
      if (err) {
        clearTimeout(done);
        resolve("unknown");
        return;
      }
      execStream = stream;
      let out = "";
      stream.on("data", (d) => {
        if (out.length < 256) out += d.toString();
      });
      stream.stderr.resume();
      stream.on("close", () => {
        clearTimeout(done);
        const lines = out
          .trim()
          .toLowerCase()
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const kernel = lines[0] || "";
        const distro = lines[1] || "";
        if (kernel === "linux") resolve(distro || "linux");
        else if (kernel === "darwin") resolve("darwin");
        else if (kernel.includes("cygwin") || kernel.includes("msys")) resolve("windows");
        else resolve(kernel || "unknown");
      });
    });
  });
}

function createTermSession(connectionId, cfg, onData, onClose, onOsDetected) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const sid = genId();

    client.on("ready", () => {
      untrackPending(connectionId, client);
      // Kick off OS detection now — resolves independently of the shell.
      const osPromise = detectOsInfo(client);
      client.shell({ term: "xterm-256color", cols: 80, rows: 24 }, (err, stream) => {
        if (err) {
          try {
            client.destroy();
          } catch {}
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
        if (cfg._keyMissing) {
          onData(
            sid,
            Buffer.from(
              "\r\n\x1b[33mWarning: SSH key file not found — using password authentication.\x1b[0m\r\n",
            ),
          );
        }
        stream.on("close", (code, signal) => {
          sessions.delete(sid);
          onClose(sid, code, signal);
          client.end();
        });
        // Resolve immediately so the renderer can set up sidToTab before any
        // ssh-data events arrive. OS info is delivered via a separate callback
        // once detection finishes — no terminal output is dropped.
        resolve(sid);
        if (onOsDetected) {
          osPromise.then((osInfo) => onOsDetected(sid, osInfo)).catch(() => {});
        }
      });
    });

    client.on("keyboard-interactive", (_name, _instr, _lang, prompts, finish) => {
      // Respond to every challenge (e.g. PAM "Password:") with the stored password.
      finish(prompts.map(() => cfg.password || ""));
    });

    client.on("error", (err) => {
      untrackPending(connectionId, client);
      if (sessions.has(sid)) {
        // Session was already established — promise is settled; must notify the
        // renderer explicitly since client.destroy() can bypass stream.close.
        sessions.delete(sid);
        try {
          client.destroy();
        } catch {}
        onClose(sid, null, null);
      } else {
        // Still connecting — reject the promise and clean up.
        sessions.delete(sid);
        try {
          client.destroy();
        } catch {}
        reject(new Error(friendlySshError(err)));
      }
    });

    trackPending(connectionId, client);
    client.connect(cfg);
  });
}

function openJumpProxy(connection, password, keyPassphrase) {
  return new Promise((resolve, reject) => {
    const jumpClient = new Client();
    const jumpCfg = {
      host: connection.jumpHost,
      port: connection.jumpPort || 22,
      username:
        (connection.username && connection.username.trim()) || os.userInfo().username,
      password,
      readyTimeout: 20000,
      tryKeyboard: true,
    };
    if (connection.sshKeyPath && connection.sshKeyPath.trim()) {
      try {
        jumpCfg.privateKey = fs.readFileSync(connection.sshKeyPath.trim());
        if (keyPassphrase) jumpCfg.passphrase = keyPassphrase;
      } catch {}
    }
    jumpClient.on("ready", () => {
      const targetHost =
        connection.protocol === "ssh-cf" ? "127.0.0.1" : connection.hostname;
      jumpClient.forwardOut(
        "127.0.0.1",
        0,
        targetHost,
        connection.port || 22,
        (err, stream) => {
          if (err) {
            jumpClient.end();
            reject(new Error(`Jump host tunnel failed: ${err.message}`));
            return;
          }
          resolve({ stream, jumpClient });
        },
      );
    });
    jumpClient.on("keyboard-interactive", (_n, _i, _l, prompts, finish) => {
      finish(prompts.map(() => password || ""));
    });
    jumpClient.on("error", (err) => {
      reject(new Error(`Jump host error: ${friendlySshError(err)}`));
    });
    jumpClient.connect(jumpCfg);
  });
}

async function sshCreateTerm(connectionId, onData, onClose, onOsDetected) {
  const { connection, password, keyPassphrase } = await resolveConnection(connectionId);
  let cfg = buildConnectConfig(connection, password, keyPassphrase);
  if (connection.jumpHost) {
    const { stream: sock, jumpClient } = await openJumpProxy(
      connection,
      password,
      keyPassphrase,
    );
    cfg = { ...cfg, sock };
    return createTermSession(
      connectionId,
      cfg,
      onData,
      (sid, code, signal) => {
        try {
          jumpClient.end();
        } catch {}
        onClose(sid, code, signal);
      },
      onOsDetected,
    );
  }
  return createTermSession(connectionId, cfg, onData, onClose, onOsDetected);
}

// ─── SFTP session ─────────────────────────────────────────────────────────────

function createSftpSession(connectionId, cfg, onClose) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const sid = genId();

    client.on("ready", () => {
      untrackPending(connectionId, client);
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
        const cleanup = () => {
          if (sessions.has(sid)) {
            sessions.delete(sid);
            onClose(sid);
          }
        };
        client.on("close", cleanup);
        sftp.on("close", cleanup);
        resolve(sid);
      });
    });

    client.on("keyboard-interactive", (_name, _instr, _lang, prompts, finish) => {
      finish(prompts.map(() => cfg.password || ""));
    });

    client.on("error", (err) => {
      untrackPending(connectionId, client);
      sessions.delete(sid);
      try {
        client.destroy();
      } catch {}
      reject(new Error(friendlySshError(err)));
    });

    trackPending(connectionId, client);
    client.connect(cfg);
  });
}

async function sshCreateSftp(connectionId, onClose) {
  const { connection, password, keyPassphrase } = await resolveConnection(connectionId);
  let cfg = buildConnectConfig(connection, password, keyPassphrase);
  if (connection.jumpHost) {
    const { stream: sock, jumpClient } = await openJumpProxy(
      connection,
      password,
      keyPassphrase,
    );
    cfg = { ...cfg, sock };
    return createSftpSession(connectionId, cfg, (sid) => {
      try {
        jumpClient.end();
      } catch {}
      onClose(sid);
    });
  }
  return createSftpSession(connectionId, cfg, onClose);
}

// ─── Session operations ───────────────────────────────────────────────────────

function sshWrite(sid, data) {
  const s = sessions.get(sid);
  if (s && s.stream && s.stream.writable) s.stream.write(data);
}

function sshResize(sid, cols, rows) {
  const s = sessions.get(sid);
  if (s && s.stream) {
    try {
      s.stream.setWindow(rows, cols, 0, 0);
    } catch {}
  }
}

function sshCloseSession(sid) {
  const s = sessions.get(sid);
  if (!s) return;
  sessions.delete(sid);
  try {
    if (s.stream) s.stream.end();
  } catch {}
  try {
    s.client.end();
  } catch {}
  setTimeout(() => {
    try {
      s.client.destroy();
    } catch {}
  }, 5000);
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

function sftpDelete(sid, remotePath, isDir) {
  const s = sessions.get(sid);
  if (!s || !s.sftpClient) return Promise.reject(new Error("No SFTP session"));
  return new Promise((resolve, reject) => {
    if (isDir) {
      s.sftpClient.rmdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      s.sftpClient.unlink(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}

function sftpRename(sid, oldPath, newPath) {
  const s = sessions.get(sid);
  if (!s || !s.sftpClient) return Promise.reject(new Error("No SFTP session"));
  return new Promise((resolve, reject) => {
    s.sftpClient.rename(oldPath, newPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function sftpMkdir(sid, remotePath) {
  const s = sessions.get(sid);
  if (!s || !s.sftpClient) return Promise.reject(new Error("No SFTP session"));
  return new Promise((resolve, reject) => {
    s.sftpClient.mkdir(remotePath, (err) => {
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
    sessions.delete(sid);
    try {
      if (s.stream) s.stream.end();
    } catch {}
    try {
      s.client.end();
    } catch {}
    // Force-destroy after 5s in case client.end() hangs on an unresponsive server.
    const client = s.client;
    setTimeout(() => {
      try {
        client.destroy();
      } catch {}
    }, 5000);
  }
}

module.exports = {
  sshCreateTerm,
  sshCreateSftp,
  sshWrite,
  sshResize,
  sshCloseSession,
  closeSessionsForConnection,
  cancelPendingConnections,
  sftpList,
  sftpHome,
  sftpDownload,
  sftpUpload,
  sftpDelete,
  sftpRename,
  sftpMkdir,
};
