"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const IS_LINUX = process.platform === "linux";

function checkBinary(name) {
  return new Promise((resolve) => {
    const cmd = IS_WIN ? "where" : "which";
    const opts = IS_WIN ? { windowsHide: true, stdio: "ignore" } : { stdio: "ignore" };
    const proc = spawn(cmd, [name], opts);
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

function checkAppExists(appPath) {
  try {
    return fs.existsSync(appPath);
  } catch {
    return false;
  }
}

// Prefer xfreerdp3 (FreeRDP v3) on Linux, otherwise v2.
// On macOS check for Microsoft Remote Desktop in /Applications.
async function findRdpClientBinary() {
  if (IS_WIN) {
    return { binary: "mstsc", found: await checkBinary("mstsc") };
  }
  if (IS_MAC) {
    const macPaths = [
      "/Applications/Microsoft Remote Desktop.app",
      path.join(os.homedir(), "Applications", "Microsoft Remote Desktop.app"),
    ];
    const found = macPaths.some(checkAppExists);
    return { binary: "Microsoft Remote Desktop", found };
  }
  // Linux
  for (const bin of ["xfreerdp3", "xfreerdp"]) {
    if (await checkBinary(bin)) return { binary: bin, found: true };
  }
  return { binary: "xfreerdp", found: false };
}

async function checkDependencies() {
  const [cloudflared, rdp] = await Promise.all([
    checkBinary("cloudflared"),
    findRdpClientBinary(),
  ]);
  return {
    cloudflared,
    mstsc: rdp.found, // kept for backward compat with renderer
    rdpClient: rdp.binary,
    rdpClientFound: rdp.found,
  };
}

// ─── Process memory — Windows ─────────────────────────────────────────────────
function getProcessMemoryBytesWindows(pid) {
  return new Promise((resolve) => {
    const proc = spawn("tasklist", ["/fi", `PID eq ${pid}`, "/fo", "csv", "/nh"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    proc.stdout.on("data", (d) => {
      if (out.length < 4096) out += d.toString();
    });
    proc.on("close", () => {
      const line = out
        .trim()
        .split("\n")
        .find((l) => l.includes(`"${pid}"`));
      if (!line) return resolve(null);
      const parts = line.split(",");
      if (parts.length < 5) return resolve(null);
      const kb = parseInt(
        parts[4]
          .replace(/"/g, "")
          .replace(/,/g, "")
          .replace(/\s*[Kk]$/, "")
          .trim(),
      );
      resolve(isNaN(kb) ? null : kb * 1024);
    });
    proc.on("error", () => resolve(null));
  });
}

// ─── Process memory — Linux ───────────────────────────────────────────────────
function getProcessMemoryBytesLinux(pid) {
  return new Promise((resolve) => {
    fs.readFile(`/proc/${pid}/status`, "utf8", (err, data) => {
      if (err) return resolve(null);
      const match = data.match(/^VmRSS:\s+(\d+)\s+kB/m);
      resolve(match ? parseInt(match[1]) * 1024 : null);
    });
  });
}

// ─── Process memory — macOS ───────────────────────────────────────────────────
// `ps -p PID -o rss=` returns the resident set size in KB.
function getProcessMemoryBytesDarwin(pid) {
  return new Promise((resolve) => {
    const proc = spawn("ps", ["-p", String(pid), "-o", "rss="], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d.toString();
    });
    proc.on("close", () => {
      const kb = parseInt(out.trim());
      resolve(isNaN(kb) ? null : kb * 1024);
    });
    proc.on("error", () => resolve(null));
  });
}

function getProcessMemoryBytes(pid) {
  if (!pid) return Promise.resolve(null);
  if (IS_WIN) return getProcessMemoryBytesWindows(pid);
  if (IS_MAC) return getProcessMemoryBytesDarwin(pid);
  if (IS_LINUX) return getProcessMemoryBytesLinux(pid);
  return Promise.resolve(null);
}

// ─── cloudflared version ──────────────────────────────────────────────────────
function fetchCloudflaredVersion() {
  return new Promise((resolve) => {
    let proc;
    const timer = setTimeout(() => {
      try {
        if (proc) proc.kill();
      } catch {}
      resolve(null);
    }, 5000);
    const spawnOpts = IS_WIN
      ? { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      : { stdio: ["ignore", "pipe", "pipe"] };
    try {
      proc = spawn("cloudflared", ["--version"], spawnOpts);
    } catch {
      clearTimeout(timer);
      resolve(null);
      return;
    }
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d.toString();
    });
    proc.stderr.on("data", (d) => {
      out += d.toString();
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const m = out.match(/version\s+([\d.]+(?:-[a-zA-Z0-9.]+)?)/i);
      resolve(m ? m[1] : out.trim().split(/[\s\n]/)[2] || null);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

module.exports = {
  checkBinary,
  findRdpClientBinary,
  checkDependencies,
  getProcessMemoryBytes,
  fetchCloudflaredVersion,
};
