const { readConnections } = require("./connections");

// serialport ships a mandatory native binding (@serialport/bindings-cpp).
// Require it lazily and cache the result so a missing/incompatible binding
// degrades to a clear error on the serial code path instead of crashing the
// whole main process (which would take down SSH/Telnet/RDP with it).
let _SerialPort = null;
let _loadError = null;

function getSerialPort() {
  if (_SerialPort) return _SerialPort;
  if (_loadError) throw _loadError;
  try {
    _SerialPort = require("serialport").SerialPort;
    return _SerialPort;
  } catch (err) {
    _loadError = new Error(
      "Serial port support is unavailable — the native serialport module failed to load. " +
        "Run `npm run rebuild` to build it for this Electron version.",
    );
    _loadError.cause = err;
    throw _loadError;
  }
}

let nextId = 1;
// sid → { port, connectionId, encoding, localEcho, lineEnding }
const sessions = new Map();

function genId() {
  return `R${nextId++}`;
}

// Node natively supports these encodings — no iconv-lite dependency needed.
const SUPPORTED_ENCODINGS = new Set(["utf8", "ascii", "latin1", "utf16le"]);

function normalizeEncoding(value) {
  const e = String(value || "utf8").toLowerCase();
  if (e === "utf-8") return "utf8";
  if (e === "iso-8859-1" || e === "binary") return "latin1";
  if (e === "utf-16le" || e === "ucs2" || e === "ucs-2") return "utf16le";
  return SUPPORTED_ENCODINGS.has(e) ? e : "utf8";
}

// Map a stored line-ending choice to the bytes sent when the user hits Enter.
// xterm emits a bare CR ("\r") for Enter; we rewrite it to the configured form.
function lineEndingBytes(choice) {
  switch (choice) {
    case "lf":
      return "\n";
    case "crlf":
      return "\r\n";
    case "none":
      return null; // send the raw CR through untouched
    case "cr":
    default:
      return "\r";
  }
}

function flowControlOptions(choice) {
  switch (choice) {
    case "rtscts":
      return { rtscts: true, xon: false, xoff: false };
    case "xonxoff":
      return { rtscts: false, xon: true, xoff: true };
    case "none":
    default:
      return { rtscts: false, xon: false, xoff: false };
  }
}

function friendlyError(err) {
  const msg = (err && (err.message || String(err))) || "Unknown serial error";
  if (/access denied|permission|EACCES/i.test(msg))
    return (
      "Access denied — the port may be in use, or your user lacks permission. " +
      "On Linux add your user to the 'dialout' (or 'uucp') group and re-login."
    );
  if (/no such file|cannot find|not exist|ENOENT|ENXIO/i.test(msg))
    return "Port not found — check that the device is connected and the path is correct.";
  if (/busy|resource busy|cannot lock|temporarily unavailable|EBUSY|EAGAIN/i.test(msg))
    return "Port is busy — another program already has it open.";
  return msg;
}

// Normalize the serial config off a stored connection into a flat settings
// object with safe defaults. Mirrors the clamping done in validation.js so a
// hand-edited connections.json can't feed bad values to the native binding.
function resolveConfig(connection) {
  const s = (connection && connection.serial) || {};
  const baudRate = Number.isFinite(s.baudRate) && s.baudRate > 0 ? s.baudRate : 9600;
  const dataBits = [5, 6, 7, 8].includes(s.dataBits) ? s.dataBits : 8;
  const stopBits = [1, 1.5, 2].includes(s.stopBits) ? s.stopBits : 1;
  const parity = ["none", "even", "odd", "mark", "space"].includes(s.parity)
    ? s.parity
    : "none";
  const flowControl = ["none", "rtscts", "xonxoff"].includes(s.flowControl)
    ? s.flowControl
    : "none";
  return {
    path: String(connection.serialPath || connection.hostname || "").trim(),
    baudRate,
    dataBits,
    stopBits,
    parity,
    flowControl,
    encoding: normalizeEncoding(s.encoding),
    dtr: s.dtr !== false,
    rts: s.rts !== false,
    localEcho: s.localEcho === true,
    lineEnding: ["cr", "lf", "crlf", "none"].includes(s.lineEnding) ? s.lineEnding : "cr",
  };
}

// ─── Port enumeration ───────────────────────────────────────────────────────

async function listSerialPorts() {
  const SerialPort = getSerialPort();
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer || "",
    serialNumber: p.serialNumber || "",
    pnpId: p.pnpId || "",
    friendlyName: p.friendlyName || "",
  }));
}

// ─── Session lifecycle ──────────────────────────────────────────────────────

async function serialCreateTerm(connectionId, onData, onClose) {
  const SerialPort = getSerialPort();
  const connections = await readConnections();
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) throw new Error("Connection not found");

  const cfg = resolveConfig(connection);
  if (!cfg.path) throw new Error("No serial port specified.");

  const flow = flowControlOptions(cfg.flowControl);

  return new Promise((resolve, reject) => {
    const sid = genId();
    let settled = false;

    const port = new SerialPort(
      {
        path: cfg.path,
        baudRate: cfg.baudRate,
        dataBits: cfg.dataBits,
        stopBits: cfg.stopBits,
        parity: cfg.parity,
        rtscts: flow.rtscts,
        xon: flow.xon,
        xoff: flow.xoff,
        autoOpen: true,
      },
      (err) => {
        // open callback
        if (err) {
          if (!settled) {
            settled = true;
            reject(new Error(friendlyError(err)));
          }
          return;
        }
        if (settled) return;
        settled = true;
        // Apply initial modem control lines (DTR/RTS). Failures here are
        // non-fatal — many USB adapters ignore them.
        try {
          port.set({ dtr: cfg.dtr, rts: cfg.rts }, () => {});
        } catch {}
        sessions.set(sid, {
          port,
          connectionId,
          onData,
          encoding: cfg.encoding,
          localEcho: cfg.localEcho,
          lineEnding: cfg.lineEnding,
        });
        resolve(sid);
      },
    );

    port.on("data", (raw) => {
      const s = sessions.get(sid);
      if (!s || !raw || raw.length === 0) return;
      // xterm decodes the byte stream as UTF-8. If the device speaks another
      // charset, transcode here so multi-byte glyphs render correctly.
      const out =
        s.encoding === "utf8" ? raw : Buffer.from(raw.toString(s.encoding), "utf8");
      onData(sid, out);
    });

    port.on("close", () => {
      sessions.delete(sid);
      onClose(sid);
    });

    port.on("error", (err) => {
      sessions.delete(sid);
      if (!settled) {
        settled = true;
        reject(new Error(friendlyError(err)));
      }
    });
  });
}

// Replace every CR (0x0D) byte in a buffer with the given ASCII ending bytes.
// Used for line-ending translation without disturbing other (possibly
// multi-byte UTF-8) bytes in the stream.
function remapCarriageReturns(buf, endingStr) {
  const end = Buffer.from(endingStr, "latin1");
  const out = [];
  for (const b of buf) {
    if (b === 0x0d) for (const e of end) out.push(e);
    else out.push(b);
  }
  return Buffer.from(out);
}

// Write user keystrokes to the port, applying line-ending translation and
// optional local echo. `data` is xterm's onData payload: a binary string where
// each char code is a raw byte (xterm emits UTF-8-encoded bytes this way).
function serialWrite(sid, data) {
  const s = sessions.get(sid);
  if (!s || !s.port || !s.port.writable) return;

  const raw = Buffer.from(data, "binary");
  const ending = lineEndingBytes(s.lineEnding);

  let buf;
  if (s.encoding === "utf8") {
    // Keep xterm's UTF-8 bytes byte-for-byte (no lossy decode round-trip);
    // only remap CR when a non-default ending is configured.
    buf =
      ending !== null && ending !== "\r" && raw.includes(0x0d)
        ? remapCarriageReturns(raw, ending)
        : raw;
  } else {
    // Transcode the UTF-8 keystrokes to the device's charset.
    let text = Buffer.from(raw).toString("utf8");
    if (ending !== null) text = text.replace(/\r/g, ending);
    buf = Buffer.from(text, s.encoding);
  }

  try {
    s.port.write(buf);
  } catch {}

  if (s.localEcho) {
    // Echo what was typed back to the terminal as UTF-8, normalizing any line
    // break to CRLF so the cursor returns to column 0 (avoids a "staircase").
    const display = Buffer.from(raw)
      .toString("utf8")
      .replace(/\r\n|\r|\n/g, "\r\n");
    s.onData(sid, Buffer.from(display, "utf8"));
  }
}

// Serial has no remote terminal size; resize is a no-op kept for API symmetry.
function serialResize() {}

function serialCloseSession(sid) {
  const s = sessions.get(sid);
  if (!s) return;
  try {
    if (s.port.isOpen) s.port.close(() => {});
    else s.port.destroy?.();
  } catch {}
  sessions.delete(sid);
}

function closeSerialSessionsForConnection(connectionId) {
  for (const [sid, s] of sessions.entries()) {
    if (s.connectionId !== connectionId) continue;
    try {
      if (s.port.isOpen) s.port.close(() => {});
    } catch {}
    sessions.delete(sid);
  }
}

module.exports = {
  listSerialPorts,
  serialCreateTerm,
  serialWrite,
  serialResize,
  serialCloseSession,
  closeSerialSessionsForConnection,
};
