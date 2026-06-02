// Pure input-sanitization helpers — no side effects, no shared state.

const PROTOCOL_DEFAULTS = {
  "rdp-cf": 3389,
  rdp: 3389,
  "ssh-cf": 22,
  ssh: 22,
  telnet: 23,
  serial: 0,
  http: 80,
  https: 443,
};

function normalizePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3389;
}

function sanitizeHostname(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 253) return "";
  // Allow RFC 1123 hostname characters, dot, hyphen, colon (IPv6), brackets,
  // and % (IPv6 zone IDs like [fe80::1%eth0]).
  // Reject shell metacharacters on Windows (& | ^ ; ` " ' etc.).
  if (/[^a-zA-Z0-9.\-:[\]_%]/.test(s)) return "";
  // Reject a leading hyphen so the value can never be parsed as a CLI flag when
  // passed to an external client (e.g. ssh's `-oProxyCommand=...`). RFC 1123
  // hostnames and IP/IPv6 literals never legitimately begin with '-'.
  if (s.startsWith("-")) return "";
  return s;
}

function sanitizeUsername(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 256) return undefined;
  // Reject control chars and Windows shell metacharacters.
  if (/[\x00-\x1f&|^;"'`<>]/.test(s)) return undefined;
  // Reject a leading hyphen — same argument-injection defense as hostnames.
  if (s.startsWith("-")) return undefined;
  return s;
}

function sanitizeProtocol(value) {
  return Object.prototype.hasOwnProperty.call(PROTOCOL_DEFAULTS, value)
    ? value
    : "rdp-cf";
}

function sanitizePath(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 512) return "";
  // Reject null bytes and common shell injection characters.
  if (/[\x00<>|;&^`]/.test(s)) return "";
  // Reject path traversal sequences to prevent reading arbitrary files.
  if (/(^|[/\\])\.\.([/\\]|$)/.test(s)) return "";
  return s;
}

// Serial device path: COM3 / \\.\COM23 (Windows) or /dev/ttyUSB0,
// /dev/tty.usbserial-1420 (Linux/macOS). Not passed to a shell, but reject
// control chars and shell metacharacters defensively.
function sanitizeSerialPath(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 256) return "";
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f<>|;&^`"'$]/.test(s)) return "";
  return s;
}

// Clamp a serial line-settings object to known-good values, applying defaults.
// Keeps a hand-edited connections.json from feeding bad input to the native
// serialport binding.
function sanitizeSerialConfig(value) {
  const s = value && typeof value === "object" ? value : {};
  const baud = Number(s.baudRate);
  const dataBits = Number(s.dataBits);
  const stopBits = Number(s.stopBits);
  return {
    baudRate: Number.isInteger(baud) && baud > 0 && baud <= 4000000 ? baud : 9600,
    dataBits: [5, 6, 7, 8].includes(dataBits) ? dataBits : 8,
    stopBits: [1, 1.5, 2].includes(stopBits) ? stopBits : 1,
    parity: ["none", "even", "odd", "mark", "space"].includes(s.parity)
      ? s.parity
      : "none",
    flowControl: ["none", "rtscts", "xonxoff"].includes(s.flowControl)
      ? s.flowControl
      : "none",
    encoding: ["utf8", "ascii", "latin1", "utf16le"].includes(s.encoding)
      ? s.encoding
      : "utf8",
    dtr: s.dtr !== false,
    rts: s.rts !== false,
    localEcho: s.localEcho === true,
    lineEnding: ["cr", "lf", "crlf", "none"].includes(s.lineEnding) ? s.lineEnding : "cr",
  };
}

function sanitizeNotes(value) {
  return String(value || "")
    .trim()
    .slice(0, 1000);
}

function sanitizeGroup(value) {
  const s = String(value || "")
    .trim()
    .slice(0, 64);
  return s;
}

module.exports = {
  PROTOCOL_DEFAULTS,
  normalizePort,
  sanitizeHostname,
  sanitizeUsername,
  sanitizeProtocol,
  sanitizePath,
  sanitizeSerialPath,
  sanitizeSerialConfig,
  sanitizeNotes,
  sanitizeGroup,
};
