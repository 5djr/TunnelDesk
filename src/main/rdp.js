"use strict";

const fs = require("fs");
const { promises: fsP } = require("fs");
const { spawn } = require("child_process");
const { shell } = require("electron");
const { activeConnections } = require("./state");
const { safeSend, sendConnectionLog, updateStatus } = require("./messaging");
const {
  buildXfreeRdpArgs,
  writeTempRdpFile,
  cleanupTempRdpFile,
} = require("./rdp-helpers");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
// Linux is the fallback (process.platform === 'linux')

// ─── Linux helpers ────────────────────────────────────────────────────────────

const LINUX_TERMINALS = [
  "x-terminal-emulator",
  "gnome-terminal",
  "konsole",
  "qterminal",
  "xfce4-terminal",
  "lxterminal",
  "xterm",
];

let _linuxTerminalCache = undefined;

async function findLinuxTerminal() {
  if (_linuxTerminalCache !== undefined) return _linuxTerminalCache;
  for (const term of LINUX_TERMINALS) {
    const found = await new Promise((resolve) => {
      const p = spawn("which", [term], { stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
      p.on("error", () => resolve(false));
    });
    if (found) {
      _linuxTerminalCache = term;
      return term;
    }
  }
  _linuxTerminalCache = null;
  return null;
}

function buildTermArgs(term, title, cmd) {
  switch (term) {
    case "gnome-terminal":
      return ["--title", title, "--", ...cmd];
    case "konsole":
      return ["--title", title, "-e", ...cmd];
    case "xterm":
      return ["-title", title, "-e", ...cmd];
    default:
      return ["-e", cmd.join(" ")];
  }
}

let _rdpBinaryCache = undefined;

async function findRdpBinary() {
  if (_rdpBinaryCache !== undefined) return _rdpBinaryCache;
  for (const bin of ["xfreerdp3", "xfreerdp"]) {
    const found = await new Promise((resolve) => {
      const p = spawn("which", [bin], { stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
      p.on("error", () => resolve(false));
    });
    if (found) {
      _rdpBinaryCache = bin;
      return bin;
    }
  }
  _rdpBinaryCache = null;
  return null;
}

// ─── External RDP watcher ─────────────────────────────────────────────────────

const rdpWatchers = new Map();

function checkRdpActive(port) {
  return new Promise((resolve) => {
    let proc;
    if (IS_WIN) {
      proc = spawn("netstat", ["-n", "-p", "TCP"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } else if (IS_MAC) {
      // lsof is available on all macOS versions; filters ESTABLISHED connections on the port.
      proc = spawn("lsof", ["-i", `TCP:${port}`, "-n", "-P"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
    } else {
      proc = spawn("ss", ["-tn", "state", "established"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
    }

    let out = "";
    proc.stdout.on("data", (d) => {
      if (out.length < 65536) out += d.toString();
    });
    proc.on("close", () => {
      let found = false;
      if (IS_WIN) {
        const portRe = new RegExp(`127\\.0\\.0\\.1:${port}(?!\\d)`);
        found = out.split("\n").some((l) => portRe.test(l) && l.includes("ESTABLISHED"));
      } else if (IS_MAC) {
        // lsof with -n -P shows "ESTABLISHED" in the NAME column for active connections.
        const portRe = new RegExp(`:${port}(?:\\s|->|$)`);
        found = out.split("\n").some((l) => portRe.test(l) && l.includes("ESTABLISHED"));
      } else {
        const portRe = new RegExp(`127\\.0\\.0\\.1:${port}(?!\\d)`);
        found = out.split("\n").some((l) => portRe.test(l));
      }
      resolve(found);
    });
    proc.on("error", () => resolve(false));
  });
}

function stopRdpWatcher(connectionId) {
  const t = rdpWatchers.get(connectionId);
  if (t !== undefined) {
    clearTimeout(t);
    rdpWatchers.delete(connectionId);
  }
}

function startRdpWatcher(connectionId, port) {
  stopRdpWatcher(connectionId);

  const poll = async () => {
    const entry = activeConnections.get(connectionId);
    if (!entry) {
      rdpWatchers.delete(connectionId);
      return;
    }
    const cfAlive = entry.proc && entry.proc.exitCode === null;
    if (!cfAlive) {
      rdpWatchers.delete(connectionId);
      return;
    }
    if (entry.mstscProc && entry.mstscProc.exitCode === null) {
      rdpWatchers.delete(connectionId);
      return;
    }

    const isActive = await checkRdpActive(port);

    const e = activeConnections.get(connectionId);
    if (!e) {
      rdpWatchers.delete(connectionId);
      return;
    }
    const stillCf = e.proc && e.proc.exitCode === null;
    if (!stillCf) {
      rdpWatchers.delete(connectionId);
      return;
    }
    if (e.mstscProc && e.mstscProc.exitCode === null) {
      rdpWatchers.delete(connectionId);
      return;
    }

    if (!e.rdpOpen && isActive) {
      e.rdpOpen = true;
      e.mstscProc = null;
      sendConnectionLog(connectionId, "External RDP client connected through tunnel.");
      safeSend("rdp-reconnected", { id: connectionId });
    } else if (e.rdpOpen && !isActive) {
      e.rdpOpen = false;
      safeSend("rdp-closed", { id: connectionId });
    }

    rdpWatchers.set(connectionId, setTimeout(poll, 2000));
  };

  rdpWatchers.set(connectionId, setTimeout(poll, 2000));
}

// ─── Windows credential management ───────────────────────────────────────────

function runCmdkey(args) {
  return new Promise((resolve) => {
    const proc = spawn("cmdkey", args, {
      windowsHide: true,
      stdio: "ignore",
    });
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, 5000);
    proc.on("exit", done);
    proc.on("error", done);
  });
}

async function storeCredential(port, username, password) {
  if (!IS_WIN) return;
  const targets = [`TERMSRV/localhost:${port}`];
  if (port === 3389) targets.push("TERMSRV/localhost");
  for (const target of targets) {
    await runCmdkey([`/delete:${target}`]);
    await runCmdkey([`/add:${target}`, `/user:${username}`, `/pass:${password}`]);
  }
}

// ─── RDP exit handler (shared between platforms) ──────────────────────────────

function onRdpExit(connectionId, port) {
  const entry = activeConnections.get(connectionId);
  if (entry) entry.rdpOpen = false;
  const cfAlive = entry && entry.proc && entry.proc.exitCode === null;
  if (cfAlive) {
    safeSend("rdp-closed", { id: connectionId });
    startRdpWatcher(connectionId, port);
  } else {
    activeConnections.delete(connectionId);
    updateStatus(connectionId, "disconnected");
  }
}

// ─── RDP launch (via Cloudflare tunnel) ──────────────────────────────────────

async function launchRemoteDesktop(port, connectionId, username, password) {
  stopRdpWatcher(connectionId);

  if (IS_WIN) {
    if (username && password) await storeCredential(port, username, password);

    const mstsc = spawn("mstsc", [`/v:localhost:${port}`], {
      stdio: "ignore",
    });
    const active = activeConnections.get(connectionId);
    if (active) {
      active.mstscProc = mstsc;
      active.rdpOpen = true;
    }

    mstsc.on("exit", () => onRdpExit(connectionId, port));
    mstsc.on("error", () => {
      sendConnectionLog(
        connectionId,
        "Failed to launch mstsc. Ensure Remote Desktop is available on Windows.",
      );
    });
  } else if (IS_MAC) {
    let tmpPath;
    try {
      tmpPath = await writeTempRdpFile(connectionId, "localhost", port, username);
    } catch (err) {
      sendConnectionLog(connectionId, `Failed to write RDP file: ${err.message}`);
      safeSend("rdp-closed", { id: connectionId });
      return;
    }
    cleanupTempRdpFile(tmpPath, 8000);

    // 'open' exits immediately after handing off to the RDP app.
    // Use the watcher to track the actual session state.
    const active = activeConnections.get(connectionId);
    if (active) {
      active.mstscProc = null;
      active.rdpOpen = false;
    }

    const openProc = spawn("open", [tmpPath], { stdio: "ignore" });
    openProc.on("exit", () => startRdpWatcher(connectionId, port));
    openProc.on("error", () => {
      sendConnectionLog(
        connectionId,
        "Failed to open RDP file. Install Microsoft Remote Desktop from the App Store (free).",
      );
      safeSend("rdp-closed", { id: connectionId });
      fsP.unlink(tmpPath).catch(() => {});
    });
  } else {
    // Linux
    const rdpBin = await findRdpBinary();
    if (!rdpBin) {
      sendConnectionLog(
        connectionId,
        "No RDP client found. Install FreeRDP: sudo apt install freerdp2-x11  (or freerdp3-x11)",
      );
      safeSend("rdp-closed", { id: connectionId });
      return;
    }
    const args = buildXfreeRdpArgs("localhost", port, username, password, rdpBin);
    const rdpProc = spawn(rdpBin, args, { stdio: "ignore" });
    const active = activeConnections.get(connectionId);
    if (active) {
      active.mstscProc = rdpProc;
      active.rdpOpen = true;
    }

    rdpProc.on("exit", () => onRdpExit(connectionId, port));
    rdpProc.on("error", () => {
      sendConnectionLog(
        connectionId,
        `Failed to launch ${rdpBin}. Install FreeRDP: sudo apt install freerdp2-x11`,
      );
    });
  }
}

// ─── RDP launch (direct, no tunnel) ──────────────────────────────────────────

async function launchRemoteDesktopDirect(connection, password) {
  const { id: connectionId, hostname, port, username } = connection;

  if (IS_WIN && username && password) {
    await storeCredential(port, username, password);
  }

  updateStatus(connectionId, "connecting");
  activeConnections.set(connectionId, {
    proc: null,
    connection,
    password,
    connectedAt: Date.now(),
  });

  let rdpProc;

  if (IS_WIN) {
    rdpProc = spawn("mstsc", [`/v:${hostname}:${port}`], {
      stdio: "ignore",
    });
  } else if (IS_MAC) {
    let tmpPath;
    try {
      tmpPath = await writeTempRdpFile(connectionId, hostname, port, username);
    } catch (err) {
      sendConnectionLog(connectionId, `Failed to write RDP file: ${err.message}`);
      activeConnections.delete(connectionId);
      updateStatus(connectionId, "disconnected");
      return;
    }
    cleanupTempRdpFile(tmpPath, 8000);

    rdpProc = spawn("open", [tmpPath], { stdio: "ignore" });
    rdpProc.on("error", () => {
      sendConnectionLog(
        connectionId,
        "Failed to open RDP file. Install Microsoft Remote Desktop from the App Store (free).",
      );
    });
  } else {
    // Linux
    const rdpBin = await findRdpBinary();
    if (!rdpBin) {
      sendConnectionLog(
        connectionId,
        "No RDP client found. Install FreeRDP: sudo apt install freerdp2-x11",
      );
      activeConnections.delete(connectionId);
      updateStatus(connectionId, "disconnected");
      return;
    }
    rdpProc = spawn(
      rdpBin,
      buildXfreeRdpArgs(hostname, port, username, password, rdpBin),
      { stdio: "ignore" },
    );
  }

  const active = activeConnections.get(connectionId);
  if (active) active.mstscProc = rdpProc;

  rdpProc.on("exit", () => {
    const entry = activeConnections.get(connectionId);
    if (entry) entry.mstscProc = null;
    sendConnectionLog(connectionId, "RDP session closed.");
    activeConnections.delete(connectionId);
    updateStatus(connectionId, "disconnected");
  });

  rdpProc.on("error", () => {
    const client = IS_WIN ? "mstsc" : IS_MAC ? "Microsoft Remote Desktop" : "xfreerdp";
    sendConnectionLog(connectionId, `Failed to launch ${client}.`);
    activeConnections.delete(connectionId);
    updateStatus(connectionId, "disconnected");
  });

  if (rdpProc.exitCode === null) {
    updateStatus(connectionId, "connected");
  }
}

// ─── SSH external client ──────────────────────────────────────────────────────

async function launchSshClient(hostname, port, username, connectionId, sshKeyPath) {
  const target = username ? `${username}@${hostname}` : hostname;
  const sshArgs = [];
  if (sshKeyPath && sshKeyPath.trim()) {
    const keyPath = sshKeyPath.trim();
    if (!fs.existsSync(keyPath)) {
      sendConnectionLog(
        connectionId,
        `SSH key not found: ${keyPath} — connecting without key.`,
      );
    } else {
      sshArgs.push("-i", keyPath);
    }
  }
  sshArgs.push("-p", String(port), target);

  if (IS_WIN) {
    const proc = spawn("cmd", ["/c", "start", `SSH — ${hostname}`, "ssh", ...sshArgs], {
      windowsHide: true,
    });
    proc.on("error", () => {
      sendConnectionLog(
        connectionId,
        "Failed to open SSH. Install OpenSSH Client via Settings → Apps → Optional Features.",
      );
    });
  } else if (IS_MAC) {
    // Open Terminal.app with the SSH command via URL scheme (supported since macOS 10.14).
    const sshUrl = `ssh://${username ? encodeURIComponent(username) + "@" : ""}${hostname}:${port}`;
    try {
      await shell.openExternal(sshUrl);
    } catch {
      // Fallback: use osascript to drive Terminal.app directly.
      const sshCmd = `ssh ${sshArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`;
      const script = `tell application "Terminal" to do script "${sshCmd.replace(/"/g, '\\"')}"\ntell application "Terminal" to activate`;
      spawn("osascript", ["-e", script], { stdio: "ignore" });
    }
  } else {
    // Linux
    const term = await findLinuxTerminal();
    if (!term) {
      sendConnectionLog(
        connectionId,
        "No terminal emulator found. Install one with: sudo apt install xterm",
      );
      return;
    }
    const termArgs = buildTermArgs(term, `SSH — ${hostname}`, ["ssh", ...sshArgs]);
    const proc = spawn(term, termArgs, { stdio: "ignore" });
    proc.on("error", () => {
      sendConnectionLog(
        connectionId,
        `Failed to open ${term}. Try: sudo apt install xterm`,
      );
    });
  }
  sendConnectionLog(connectionId, `SSH — opening terminal to ${target}:${port}`);
}

// ─── Telnet external client ───────────────────────────────────────────────────

async function launchTelnetClient(hostname, port, connectionId) {
  if (IS_WIN) {
    const proc = spawn(
      "cmd",
      ["/c", "start", `Telnet — ${hostname}`, "telnet", hostname, String(port)],
      { windowsHide: true },
    );
    proc.on("error", () => {
      sendConnectionLog(
        connectionId,
        "Failed to open Telnet. Enable Telnet Client in Windows Features.",
      );
    });
  } else if (IS_MAC) {
    // macOS Catalina+ removed telnet; suggest nc (netcat) as an alternative.
    const telnetUrl = `telnet://${hostname}:${port}`;
    try {
      await shell.openExternal(telnetUrl);
    } catch {
      const script = `tell application "Terminal" to do script "telnet ${hostname} ${port}"\ntell application "Terminal" to activate`;
      const proc = spawn("osascript", ["-e", script], { stdio: "ignore" });
      proc.on("error", () => {
        sendConnectionLog(
          connectionId,
          "Failed to open Telnet. Install telnet via Homebrew: brew install telnet",
        );
      });
    }
  } else {
    // Linux
    const term = await findLinuxTerminal();
    if (!term) {
      sendConnectionLog(
        connectionId,
        "No terminal emulator found. Install one with: sudo apt install xterm",
      );
      return;
    }
    const termArgs = buildTermArgs(term, `Telnet — ${hostname}`, [
      "telnet",
      hostname,
      String(port),
    ]);
    const proc = spawn(term, termArgs, { stdio: "ignore" });
    proc.on("error", () => {
      sendConnectionLog(
        connectionId,
        "Failed to open Telnet terminal. Install: sudo apt install telnet xterm",
      );
    });
  }
  sendConnectionLog(connectionId, `Telnet — connecting to ${hostname}:${port}`);
}

// ─── Cleanup on quit ─────────────────────────────────────────────────────────

function deleteStoredCredential(port) {
  if (!IS_WIN) return;
  const { spawnSync } = require("child_process");
  const targets = [`TERMSRV/localhost:${port}`];
  if (port === 3389) targets.push("TERMSRV/localhost");
  for (const target of targets) {
    try {
      spawnSync("cmdkey", [`/delete:${target}`], { windowsHide: true, stdio: "ignore" });
    } catch {}
  }
}

module.exports = {
  storeCredential,
  deleteStoredCredential,
  launchRemoteDesktop,
  launchRemoteDesktopDirect,
  launchSshClient,
  launchTelnetClient,
};
