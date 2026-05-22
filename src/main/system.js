const { spawn } = require("child_process");

function checkBinary(name) {
  return new Promise((resolve) => {
    const proc = spawn("where", [name], { windowsHide: true, stdio: "ignore" });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

async function checkDependencies() {
  const [cloudflared, mstsc] = await Promise.all([
    checkBinary("cloudflared"),
    checkBinary("mstsc"),
  ]);
  return { cloudflared, mstsc };
}

// Returns the working-set memory (bytes) of a Windows process via tasklist.
// Uses only a built-in Windows command so no extra npm packages are needed.
function getProcessMemoryBytes(pid) {
  if (!pid) return Promise.resolve(null);
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
      // Field 4 looks like: "50,000 K"
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

// Runs `cloudflared --version` once at startup.
function fetchCloudflaredVersion() {
  return new Promise((resolve) => {
    let proc;
    const timer = setTimeout(() => {
      try {
        if (proc) proc.kill();
      } catch {}
      resolve(null);
    }, 5000);
    proc = spawn("cloudflared", ["--version"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
  checkDependencies,
  getProcessMemoryBytes,
  fetchCloudflaredVersion,
};
