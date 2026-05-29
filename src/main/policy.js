"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");

const POLICY_KEY = "HKLM\\SOFTWARE\\Policies\\TunnelDesk";

const DWORD_KEYS = new Set(["EnforceSSO", "DisableManualConnections", "SyncInterval"]);
const STRING_KEYS = new Set([
  "ConfigSyncUrl",
  "TenantId",
  "ClientId",
  "BannerMessage",
  "AllowedProtocols",
]);

let cached = {};
let pollTimer = null;

function readWindowsPolicy() {
  const result = spawnSync("reg", ["query", POLICY_KEY], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 3000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || !result.stdout) return {};

  const raw = {};
  for (const line of result.stdout.split("\n")) {
    const m = line.match(/^\s+(\S+)\s+REG_(\w+)\s+(.+?)\s*$/);
    if (!m) continue;
    const [, name, type, value] = m;
    if (DWORD_KEYS.has(name) && type === "DWORD") {
      raw[name] = parseInt(value, 16) || parseInt(value, 10) || 0;
    } else if (STRING_KEYS.has(name)) {
      raw[name] = value;
    }
  }
  return raw;
}

function readLinuxPolicy() {
  try {
    const raw = fs.readFileSync("/etc/tunneldesk/policy.json", "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

function normalize(raw) {
  const p = {};
  if (typeof raw.ConfigSyncUrl === "string" && raw.ConfigSyncUrl.startsWith("https://")) {
    p.configSyncUrl = raw.ConfigSyncUrl.slice(0, 1024);
  }
  if (typeof raw.TenantId === "string" && raw.TenantId) {
    p.tenantId = raw.TenantId.trim().slice(0, 128);
  }
  if (typeof raw.ClientId === "string" && raw.ClientId) {
    p.clientId = raw.ClientId.trim().slice(0, 128);
  }
  if (raw.EnforceSSO === 1 || raw.EnforceSSO === true) p.enforceSSO = true;
  if (raw.DisableManualConnections === 1 || raw.DisableManualConnections === true) {
    p.disableManualConnections = true;
  }
  if (typeof raw.SyncInterval === "number" && raw.SyncInterval >= 60) {
    p.syncInterval = Math.min(raw.SyncInterval, 86400);
  }
  if (typeof raw.BannerMessage === "string" && raw.BannerMessage) {
    p.bannerMessage = raw.BannerMessage.slice(0, 512);
  }
  if (typeof raw.AllowedProtocols === "string" && raw.AllowedProtocols) {
    p.allowedProtocols = raw.AllowedProtocols.split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  } else if (Array.isArray(raw.AllowedProtocols)) {
    p.allowedProtocols = raw.AllowedProtocols.filter((x) => typeof x === "string");
  }
  return p;
}

function readPolicy() {
  const raw = process.platform === "win32" ? readWindowsPolicy() : readLinuxPolicy();
  cached = normalize(raw);
  return cached;
}

function getPolicy() {
  return cached;
}

function startPolicyPolling(intervalMs, onChange) {
  cached = readPolicy();
  onChange(cached);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    const prev = JSON.stringify(cached);
    readPolicy();
    if (JSON.stringify(cached) !== prev) onChange(cached);
  }, intervalMs);
}

function stopPolicyPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = { readPolicy, getPolicy, startPolicyPolling, stopPolicyPolling };
