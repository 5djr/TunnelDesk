"use strict";

// Pure RDP launch helpers with no Electron dependency, so they can be unit
// tested in a plain Node process (see test/multi-rdp.test.js). The actual
// client-spawning logic lives in rdp.js, which imports these.

const { promises: fsP } = require("fs");
const os = require("os");
const path = require("path");

// Build the xfreerdp/xfreerdp3 argument vector. The host:port pair is whatever
// caller passes — for Cloudflare Access tunnels this is the dynamically
// allocated loopback port, so every connection targets its own local listener.
function buildXfreeRdpArgs(host, port, username, password, binary) {
  const certFlag = binary === "xfreerdp" ? "/cert-ignore" : "/cert:ignore";
  const args = [`/v:${host}:${port}`, certFlag, "/dynamic-resolution", "+clipboard"];
  if (username) args.push(`/u:${username}`);
  // Password passed as argument to xfreerdp — visible in process list (xfreerdp limitation).
  if (password) args.push(`/p:${password}`);
  return args;
}

// Write a .rdp file to a temp path and return it. The filename embeds the
// connection id and a timestamp so simultaneous connections never collide, and
// `full address` carries the per-connection local port.
async function writeTempRdpFile(connectionId, host, port, username) {
  const tmpPath = path.join(os.tmpdir(), `tunneldesk-${connectionId}-${Date.now()}.rdp`);
  const lines = [
    "screen mode id:i:2",
    `full address:s:${host}:${port}`,
    username ? `username:s:${username}` : null,
    "audiomode:i:0",
    "autoreconnection enabled:i:1",
    "authentication level:i:2",
    "negotiate security layer:i:1",
    "prompt for credentials:i:1",
    "enablecredsspsupport:i:1",
  ].filter(Boolean);
  await fsP.writeFile(tmpPath, lines.join("\r\n") + "\r\n", "utf8");
  return tmpPath;
}

function cleanupTempRdpFile(tmpPath, delayMs = 8000) {
  setTimeout(() => fsP.unlink(tmpPath).catch(() => {}), delayMs);
}

module.exports = { buildXfreeRdpArgs, writeTempRdpFile, cleanupTempRdpFile };
