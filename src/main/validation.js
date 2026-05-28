// Pure input-sanitization helpers — no side effects, no shared state.

const PROTOCOL_DEFAULTS = {
  "rdp-cf": 3389,
  rdp: 3389,
  "ssh-cf": 22,
  ssh: 22,
  telnet: 23,
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
  return s;
}

function sanitizeUsername(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 256) return undefined;
  // Reject control chars and Windows shell metacharacters.
  if (/[\x00-\x1f&|^;"'`<>]/.test(s)) return undefined;
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
  return s;
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
  sanitizeNotes,
  sanitizeGroup,
};
