const net = require("net");
const { readConnections } = require("./connections");

// ─── Telnet protocol constants ────────────────────────────────────────────────
const IAC = 255;
const WILL = 251,
  WONT = 252,
  DO = 253,
  DONT = 254;
const SB = 250,
  SE = 240;
const OPT_ECHO = 1,
  OPT_SGA = 3,
  OPT_NAWS = 31,
  OPT_TTYPE = 24;
const TTYPE_IS = 0,
  TTYPE_SEND = 1;

let nextId = 1;
// sid → { socket, connectionId, cols, rows, nawsEnabled }
const sessions = new Map();

function genId() {
  return `T${nextId++}`;
}

function friendlyError(err) {
  const code = err.code;
  const msg = err.message || String(err);
  if (code === "ECONNRESET") return "Connection reset by the server.";
  if (code === "ECONNREFUSED")
    return "Connection refused — nothing is listening on that port.";
  if (code === "ETIMEDOUT" || code === "ECONNABORTED")
    return "Connection timed out — check the hostname and your network.";
  if (code === "ENOTFOUND") return "Hostname not found — check the server address.";
  return msg;
}

function buildNaws(cols, rows) {
  return [
    IAC,
    SB,
    OPT_NAWS,
    (cols >> 8) & 0xff,
    cols & 0xff,
    (rows >> 8) & 0xff,
    rows & 0xff,
    IAC,
    SE,
  ];
}

// Parse raw bytes from the server, strip IAC sequences, send option responses.
// Returns a Buffer containing only the printable/data bytes.
function parseTelnet(session, raw) {
  const responses = [];
  const output = [];
  let i = 0;

  while (i < raw.length) {
    if (raw[i] !== IAC) {
      output.push(raw[i++]);
      continue;
    }
    i++; // consume IAC
    if (i >= raw.length) break;
    const cmd = raw[i++];

    if (cmd === IAC) {
      output.push(0xff); // escaped literal 0xFF in data stream
    } else if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
      if (i >= raw.length) break;
      const opt = raw[i++];
      if (cmd === WILL) {
        // Server announces it WILL do something — we accept ECHO and SGA
        if (opt === OPT_ECHO || opt === OPT_SGA) {
          responses.push(IAC, DO, opt);
        } else {
          responses.push(IAC, DONT, opt);
        }
      } else if (cmd === DO) {
        // Server asks US to do something
        if (opt === OPT_NAWS) {
          responses.push(IAC, WILL, OPT_NAWS);
          session.nawsEnabled = true;
          responses.push(...buildNaws(session.cols, session.rows));
        } else if (opt === OPT_TTYPE) {
          responses.push(IAC, WILL, OPT_TTYPE);
        } else if (opt === OPT_SGA) {
          responses.push(IAC, WILL, OPT_SGA);
        } else {
          responses.push(IAC, WONT, opt);
        }
      }
      // WONT / DONT — no response required
    } else if (cmd === SB) {
      // Collect subnegotiation bytes until IAC SE
      const start = i;
      while (i < raw.length) {
        if (raw[i] === IAC && i + 1 < raw.length && raw[i + 1] === SE) {
          i += 2;
          break;
        }
        i++;
      }
      const sub = raw.slice(start, i - 2);
      // Terminal-type subnegotiation: server sends SEND, we reply IS xterm-256color
      if (sub.length >= 2 && sub[0] === OPT_TTYPE && sub[1] === TTYPE_SEND) {
        const ttype = Buffer.from("xterm-256color");
        responses.push(IAC, SB, OPT_TTYPE, TTYPE_IS, ...ttype, IAC, SE);
      }
    }
    // NOP (241), DM (242), GA (249), EL (248), EC (247), etc. — silently skip
  }

  if (responses.length > 0) {
    try {
      session.socket.write(Buffer.from(responses));
    } catch {}
  }

  return Buffer.from(output);
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

async function telnetCreateTerm(connectionId, onData, onClose) {
  const connections = await readConnections();
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) throw new Error("Connection not found");

  const hostname = connection.hostname;
  const port = connection.port || 23;

  return new Promise((resolve, reject) => {
    const sid = genId();
    let settled = false;

    const socket = net.createConnection({ host: hostname, port });
    const session = { socket, connectionId, cols: 80, rows: 24, nawsEnabled: false };

    // Hard timeout in case the TCP handshake hangs
    const connectTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("Connection timed out — check the hostname and your network."));
    }, 15000);

    socket.once("connect", () => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimeout);
      sessions.set(sid, session);
      resolve(sid);
    });

    socket.on("data", (raw) => {
      const s = sessions.get(sid);
      if (!s) return;
      const output = parseTelnet(s, raw);
      if (output.length > 0) onData(sid, output);
    });

    socket.on("close", () => {
      sessions.delete(sid);
      onClose(sid);
    });

    socket.on("error", (err) => {
      clearTimeout(connectTimeout);
      sessions.delete(sid);
      if (!settled) {
        settled = true;
        reject(new Error(friendlyError(err)));
      }
    });
  });
}

// Write user keystrokes to the socket, escaping 0xFF bytes as per RFC 854.
function telnetWrite(sid, data) {
  const s = sessions.get(sid);
  if (!s) return;
  // data from xterm onData is a string where each char is a raw byte (binary/latin1)
  const buf = Buffer.from(data, "binary");
  const escaped = [];
  for (const b of buf) {
    escaped.push(b);
    if (b === 0xff) escaped.push(0xff); // RFC 854: IAC must be doubled in data
  }
  try {
    s.socket.write(Buffer.from(escaped));
  } catch {}
}

// Notify the server of a terminal resize via NAWS subnegotiation.
function telnetResize(sid, cols, rows) {
  const s = sessions.get(sid);
  if (!s) return;
  s.cols = cols;
  s.rows = rows;
  if (s.nawsEnabled) {
    try {
      s.socket.write(Buffer.from(buildNaws(cols, rows)));
    } catch {}
  }
}

function telnetCloseSession(sid) {
  const s = sessions.get(sid);
  if (!s) return;
  try {
    s.socket.destroy();
  } catch {}
  sessions.delete(sid);
}

function closeTelnetSessionsForConnection(connectionId) {
  for (const [sid, s] of sessions.entries()) {
    if (s.connectionId !== connectionId) continue;
    try {
      s.socket.destroy();
    } catch {}
    sessions.delete(sid);
  }
}

module.exports = {
  telnetCreateTerm,
  telnetWrite,
  telnetResize,
  telnetCloseSession,
  closeTelnetSessionsForConnection,
};
