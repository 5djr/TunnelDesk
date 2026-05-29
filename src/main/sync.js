"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs").promises;
const path = require("path");
const { state } = require("./state");
const { safeSend } = require("./messaging");
const {
  sanitizeHostname,
  normalizePort,
  sanitizeUsername,
  sanitizeProtocol,
  sanitizeNotes,
  sanitizeGroup,
} = require("./validation");

let syncTimer = null;
let managedConnections = [];
let lastSyncTime = null;
let lastSyncError = null;

function managedPath() {
  return path.join(state.userDataPath, "managed-connections.json");
}

function normalizeManaged(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    // Apply the same sanitization as user-defined connections.
    const hostname = sanitizeHostname(c.hostname);
    if (!hostname) continue;
    const proto = sanitizeProtocol(c.protocol);
    const username = sanitizeUsername(c.username) || "";
    const idSlug = String(c.id || hostname)
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase()
      .slice(0, 64);
    out.push({
      id: `managed-${idSlug}`,
      friendlyName: String(c.friendlyName || hostname)
        .trim()
        .slice(0, 128),
      hostname,
      port: normalizePort(c.port),
      username,
      protocol: proto,
      notes: sanitizeNotes(c.notes),
      group: sanitizeGroup(c.group) || "Managed",
      sshKeyPath: "", // never allow remote-controlled key paths
      jumpHost: "",
      jumpPort: null,
      hasPassword: false,
      hasSshKey: false,
      hasSshKeyPassphrase: false,
      temp: false,
      managed: true,
    });
  }
  return out;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return reject(new Error("Invalid sync URL"));
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return reject(new Error("Sync URL must start with https://"));
    }
    const mod = target.protocol === "https:" ? https : http;
    const chunks = [];
    let size = 0;
    const req = mod.request(
      {
        hostname: target.hostname,
        port: target.port || undefined,
        path: (target.pathname || "/") + (target.search || ""),
        method: "GET",
        timeout: 10000,
        headers: { "User-Agent": "TunnelDesk/1.0" },
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 512 * 1024) {
            req.destroy();
            reject(new Error("Policy file too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Invalid JSON in policy file"));
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Sync request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function loadCachedConnections() {
  try {
    const raw = await fs.readFile(managedPath(), "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.connections)) {
      managedConnections = data.connections;
    }
  } catch {}
}

async function saveCache(connections, policies) {
  const tmp = managedPath() + `.tmp.${Date.now()}`;
  await fs.writeFile(
    tmp,
    JSON.stringify(
      { connections, policies: policies || {}, savedAt: Date.now() },
      null,
      2,
    ),
  );
  await fs.rename(tmp, managedPath());
}

async function fetchAndApply(url) {
  const raw = await fetchUrl(url);
  if (!raw || typeof raw !== "object") throw new Error("Invalid policy response");

  const connections = normalizeManaged(raw.managedConnections || raw.connections || []);
  const policies = raw.policies && typeof raw.policies === "object" ? raw.policies : {};
  const syncInterval =
    typeof raw.syncInterval === "number" && raw.syncInterval >= 60
      ? raw.syncInterval
      : 300;

  managedConnections = connections;
  lastSyncTime = Date.now();
  lastSyncError = null;
  await saveCache(connections, policies);
  safeSend("managed-connections-updated", { connections, policies });
  return { connections, policies, syncInterval };
}

async function startSync(syncUrl, intervalSeconds) {
  stopSync();
  await loadCachedConnections();
  if (!syncUrl) return;

  let interval = Math.max(60, intervalSeconds || 300);
  try {
    const result = await fetchAndApply(syncUrl);
    interval = Math.max(60, result.syncInterval || interval);
  } catch (err) {
    lastSyncError = err.message;
    console.error("[TunnelDesk] Initial sync failed:", err.message);
  }

  syncTimer = setInterval(async () => {
    try {
      await fetchAndApply(syncUrl);
    } catch (err) {
      lastSyncError = err.message;
      console.error("[TunnelDesk] Sync failed:", err.message);
    }
  }, interval * 1000);
}

function stopSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

function getManagedConnections() {
  return managedConnections;
}

function getSyncStatus() {
  return { lastSyncTime, lastSyncError, count: managedConnections.length };
}

module.exports = {
  startSync,
  stopSync,
  getManagedConnections,
  getSyncStatus,
  fetchAndApply,
  loadCachedConnections,
};
