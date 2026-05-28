const fs = require("fs");
const { spawn } = require("child_process");
const { activeConnections } = require("./state");
const { safeSend, sendConnectionLog, updateStatus } = require("./messaging");

const IS_WIN = process.platform === "win32";

// ─── Linux helpers ────────────────────────────────────────────────────────────

// Terminal emulators tried in order of preference. x-terminal-emulator is the
// Debian/Ubuntu update-alternatives default; qterminal is the Kali default.
const LINUX_TERMINALS = [
  "x-terminal-emulator",
  "gnome-terminal",
  "konsole",
  "qterminal",
  "xfce4-terminal",
  "lxterminal",
  "xterm",
];

let _linuxTerminalCache = undefined; // undefined = not checked yet, null = none found

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

// Build args to launch a command inside a terminal emulator.
// Each terminal has its own flag conventions.
function buildTermArgs(term, title, cmd) {
  switch (term) {
    case "gnome-terminal":
      return ["--title", title, "--", ...cmd];
    case "konsole":
      return ["--title", title, "-e", ...cmd];
    case "xterm":
      return ["-title", title, "-e", ...cmd];
    default:
      // x-terminal-emulator, qterminal, xfce4-terminal, lxterminal, etc.
      return ["-e", cmd.join(" ")];
  }
}

// Cache the detected xfreerdp binary (prefer xfreerdp3 / FreeRDP v3 over v2).
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

// Build xfreerdp argument list. The /cert flag changed between v2 (/cert-ignore)
// and v3 (/cert:ignore), so we adapt based on which binary was found.
function buildXfreeRdpArgs(host, port, username, password, binary) {
  const certFlag = binary === "xfreerdp" ? "/cert-ignore" : "/cert:ignore";
  const args = [`/v:${host}:${port}`, certFlag, "/dynamic-resolution", "+clipboard"];
  if (username) args.push(`/u:${username}`);
  if (password) args.push(`/p:${password}`);
  return args;
}

// ─── External RDP watcher ─────────────────────────────────────────────────────
// After the tracked RDP client exits (while cloudflared is still alive), poll
// the local port so we notice if the user opens their own client and reconnects
// through the still-running tunnel. Clears the "RDP Disconnected" UI state.

const rdpWatchers = new Map(); // connectionId -> setTimeout handle

function checkRdpActive(port) {
  return new Promise((resolve) => {
    let proc;
    // Windows: netstat -n -p TCP (ESTABLISHED lines include the state)
    // Linux:   ss -tn state established (rows are already filtered)
    if (IS_WIN) {
      proc = spawn("netstat", ["-n", "-p", "TCP"], {
        windowsHide: true,
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
      const portRe = new RegExp(`127\\.0\\.0\\.1:${port}(?!\\d)`);
      const found = out.split("\n").some((line) => {
        if (IS_WIN) return portRe.test(line) && line.includes("ESTABLISHED");
        return portRe.test(line); // ss already filters for ESTABLISHED
      });
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
    const cfAlive = entry && entry.proc && entry.proc.exitCode === null;
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
    const stillCf = e && e.proc && e.proc.exitCode === null;
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
// cmdkey stores/removes credentials in the Windows Credential Manager so that
// mstsc auto-fills them without prompting. Not needed on Linux — xfreerdp
// accepts /u: and /p: arguments directly.

function runCmdkey(args) {
  return new Promise((resolve) => {
    const proc = spawn("cmdkey", args, { windowsHide: true, stdio: "ignore" });
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 5000);
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

// ─── RDP launch (via Cloudflare tunnel) ──────────────────────────────────────

async function launchRemoteDesktop(port, connectionId, username, password) {
  stopRdpWatcher(connectionId);

  if (IS_WIN) {
    if (username && password) await storeCredential(port, username, password);

    const mstsc = spawn("mstsc", [`/v:localhost:${port}`], { stdio: "ignore" });

    const active = activeConnections.get(connectionId);
    if (active) {
      active.mstscProc = mstsc;
      active.rdpOpen = true;
    }

    mstsc.on("exit", () => {
      const entry = activeConnections.get(connectionId);
      if (entry) entry.rdpOpen = false;
      const cfAlive = entry && entry.proc && entry.proc.exitCode === null;
      if (cfAlive) {
        safeSend("rdp-closed", { id: connectionId });
        startRdpWatcher(connectionId, entry.connection.port);
      } else {
        activeConnections.delete(connectionId);
        updateStatus(connectionId, "disconnected");
      }
    });

    mstsc.on("error", () => {
      sendConnectionLog(
        connectionId,
        "Failed to launch mstsc. Ensure Remote Desktop is available on Windows.",
      );
    });
  } else {
    // Linux — use xfreerdp/xfreerdp3
    const rdpBin = await findRdpBinary();
    if (!rdpBin) {
      sendConnectionLog(
        connectionId,
        "No RDP client found. Install FreeRDP: sudo apt install freerdp2-x11  (or freerdp3-x11 on newer systems)",
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

    rdpProc.on("exit", () => {
      const entry = activeConnections.get(connectionId);
      if (entry) entry.rdpOpen = false;
      const cfAlive = entry && entry.proc && entry.proc.exitCode === null;
      if (cfAlive) {
        safeSend("rdp-closed", { id: connectionId });
        startRdpWatcher(connectionId, entry.connection.port);
      } else {
        activeConnections.delete(connectionId);
        updateStatus(connectionId, "disconnected");
      }
    });

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
  if (IS_WIN && connection.username && password) {
    await storeCredential(connection.port, connection.username, password);
  }

  updateStatus(connection.id, "connecting");
  activeConnections.set(connection.id, {
    proc: null,
    connection,
    password,
    connectedAt: Date.now(),
  });

  let rdpProc;
  if (IS_WIN) {
    rdpProc = spawn("mstsc", [`/v:${connection.hostname}:${connection.port}`], {
      stdio: "ignore",
    });
  } else {
    const rdpBin = await findRdpBinary();
    if (!rdpBin) {
      sendConnectionLog(
        connection.id,
        "No RDP client found. Install FreeRDP: sudo apt install freerdp2-x11  (or freerdp3-x11)",
      );
      activeConnections.delete(connection.id);
      updateStatus(connection.id, "disconnected");
      return;
    }
    const args = buildXfreeRdpArgs(
      connection.hostname,
      connection.port,
      connection.username,
      password,
      rdpBin,
    );
    rdpProc = spawn(rdpBin, args, { stdio: "ignore" });
  }

  const active = activeConnections.get(connection.id);
  if (active) active.mstscProc = rdpProc;

  rdpProc.on("exit", () => {
    const entry = activeConnections.get(connection.id);
    if (entry) entry.mstscProc = null;
    sendConnectionLog(connection.id, "RDP session closed.");
    activeConnections.delete(connection.id);
    updateStatus(connection.id, "disconnected");
  });

  rdpProc.on("error", () => {
    const client = IS_WIN ? "mstsc" : "xfreerdp";
    sendConnectionLog(connection.id, `Failed to launch ${client}.`);
    activeConnections.delete(connection.id);
    updateStatus(connection.id, "disconnected");
  });

  // Only mark connected if the process hasn't already exited (e.g. spawn error).
  if (rdpProc.exitCode === null) {
    updateStatus(connection.id, "connected");
  }
}

// ─── SSH external client (fallback, not used for embedded terminal) ───────────

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
  } else {
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
        `Failed to open ${term}. Try installing xterm: sudo apt install xterm`,
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
  } else {
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
        "Failed to open Telnet terminal. Install telnet and xterm: sudo apt install telnet xterm",
      );
    });
  }
  sendConnectionLog(connectionId, `Telnet — connecting to ${hostname}:${port}`);
}

module.exports = {
  storeCredential,
  launchRemoteDesktop,
  launchRemoteDesktopDirect,
  launchSshClient,
  launchTelnetClient,
};
