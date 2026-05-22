export {};

// ─── Types ────────────────────────────────────────────────────────────────────

type Protocol = "rdp-cf" | "rdp" | "ssh-cf" | "ssh" | "telnet" | "http" | "https";

interface Connection {
  id: string;
  friendlyName: string;
  hostname: string;
  port: number;
  username?: string;
  hasPassword: boolean;
  protocol: Protocol;
  notes: string;
  group: string;
  sshKeyPath: string;
  hasSshKey: boolean;
}

type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface TunnelStats {
  pid: number | null;
  localEndpoint: string;
  hostname: string;
  protocol: string;
  alive: boolean;
  connectedAt: number | null;
  uptime: number | null;
  latency: number | null;
  latencyMin: number | null;
  latencyMax: number | null;
  latencyAvg: number | null;
  latencyJitter: number | null;
  latencySamples: number;
  latencyHistoryMax: number;
  cloudflaredVersion: string | null;
  cloudflaredMemBytes: number | null;
  mstscPid: number | null;
  mstscMemBytes: number | null;
  systemOs: string;
  systemHostname: string;
  systemRamFree: number;
  systemRamTotal: number;
  localIps: Array<{ name: string; address: string }>;
}

interface Settings {
  cloudflaredPath: string;
  defaultProtocol: string;
  minimizeToTray: boolean;
  startMinimized: boolean;
  logRetentionDays: number;
}

declare global {
  interface Window {
    api: {
      loadConnections(): Promise<Connection[]>;
      saveConnection(conn: {
        id?: string;
        friendlyName: string;
        hostname: string;
        port: number;
        username?: string;
        password?: string;
        keepExistingPassword?: boolean;
        protocol: string;
        notes?: string;
        group?: string;
        sshKeyPath?: string;
      }): Promise<Connection>;
      deleteConnection(id: string): Promise<Connection[]>;
      connect(id: string): Promise<{ status: string }>;
      disconnect(id: string): Promise<{ status: string }>;
      getStatuses(): Promise<Record<string, ConnectionStatus>>;
      getTunnelStats(id: string): Promise<TunnelStats | null>;
      launchRdp(id: string): Promise<{ status: string }>;
      getSettings(): Promise<Settings>;
      saveSettings(s: Partial<Settings>): Promise<Settings>;
      pickFile(opts?: {
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }): Promise<string | null>;
      openLogFolder(): Promise<void>;
      openExternal(url: string): Promise<void>;
      onStatusUpdate(cb: (data: { id: string; status: ConnectionStatus }) => void): void;
      onLog(cb: (data: { id?: string; message: string }) => void): void;
      onRdpClosed(cb: (data: { id: string }) => void): void;
      onDepsStatus(cb: (data: { cloudflared: boolean; mstsc: boolean }) => void): void;
      onAuthRequired(cb: (data: { id: string; url: string }) => void): void;
    };
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let connections: Connection[] = [];
const statuses: Record<string, ConnectionStatus> = {};
const rdpClosed = new Set<string>();
let selectedId: string | null = null;
let debugMode = false;
let debugPollTimer: ReturnType<typeof setTimeout> | null = null;
let debugPollRunning = false;
let settingsView = false;
let searchQuery = "";
const collapsedGroups = new Set<string>();
let currentSettings: Settings | null = null;

// ─── DOM Refs ─────────────────────────────────────────────────────────────────

const sidebarList = document.getElementById("sidebar-list") as HTMLElement;
const detailPanel = document.getElementById("detail-panel") as HTMLElement;
const activityLog = document.getElementById("activity-log") as HTMLElement;
const logClearBtn = document.getElementById("log-clear") as HTMLButtonElement;
const formModal = document.getElementById("form-modal") as HTMLElement;
const formTitle = document.getElementById("form-title") as HTMLElement;
const saveForm = document.getElementById("save-form") as HTMLFormElement;
const idInput = document.getElementById("connection-id") as HTMLInputElement;
const nameInput = document.getElementById("friendly-name") as HTMLInputElement;
const hostInput = document.getElementById("hostname") as HTMLInputElement;
const portInput = document.getElementById("port") as HTMLInputElement;
const usernameInput = document.getElementById("cred-username") as HTMLInputElement;
const passwordInput = document.getElementById("cred-password") as HTMLInputElement;
const protocolInput = document.getElementById("protocol") as HTMLSelectElement;
const groupInput = document.getElementById("conn-group") as HTMLInputElement;
const notesInput = document.getElementById("conn-notes") as HTMLTextAreaElement;
const sshKeyGroup = document.getElementById("ssh-key-group") as HTMLElement;
const sshKeyPathInput = document.getElementById("ssh-key-path") as HTMLInputElement;
const sshKeyBrowseBtn = document.getElementById("ssh-key-browse") as HTMLButtonElement;
const sshKeyClearBtn = document.getElementById("ssh-key-clear") as HTMLButtonElement;
const newBtn = document.getElementById("new-connection") as HTMLButtonElement;
const cancelTopBtn = document.getElementById("cancel-save") as HTMLButtonElement;
const cancelBotBtn = document.getElementById("cancel-save-bottom") as HTMLButtonElement;
const toastEl = document.getElementById("toast") as HTMLElement;
const depsWarning = document.getElementById("deps-warning") as HTMLElement;
const depsWarningText = document.getElementById("deps-warning-text") as HTMLElement;
const depsWarningDismiss = document.getElementById(
  "deps-warning-dismiss",
) as HTMLButtonElement;
const confirmModal = document.getElementById("confirm-modal") as HTMLElement;
const confirmMsg = document.getElementById("confirm-message") as HTMLElement;
const confirmOkBtn = document.getElementById("confirm-ok") as HTMLButtonElement;
const confirmCancel = document.getElementById("confirm-cancel") as HTMLButtonElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout>;

function showToast(message: string, type: "success" | "error" | "info" = "info") {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast ${type} show`;
  toastTimer = setTimeout(() => {
    toastEl.className = "toast";
  }, 3400);
}

// ─── Format Helpers ───────────────────────────────────────────────────────────

function formatBytes(b: number | null): string {
  if (b === null || b === undefined) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function formatAbsTime(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ─── Protocol Helpers ─────────────────────────────────────────────────────────

const PROTOCOL_DEFAULT_PORTS: Record<string, number> = {
  "rdp-cf": 3389,
  rdp: 3389,
  "ssh-cf": 22,
  ssh: 22,
  telnet: 23,
  http: 80,
  https: 443,
};

function protocolLabel(p: string): string {
  switch (p) {
    case "rdp-cf":
      return "RDP / Cloudflare Access";
    case "rdp":
      return "RDP / Direct";
    case "ssh-cf":
      return "SSH / Cloudflare Access";
    case "ssh":
      return "SSH / Direct";
    case "telnet":
      return "Telnet";
    case "http":
      return "HTTP";
    case "https":
      return "HTTPS";
    default:
      return p;
  }
}

function connectLabel(p: string): string {
  if (p === "http" || p === "https") return "Open in Browser";
  if (p === "ssh" || p === "telnet") return "Launch";
  return "Connect";
}

function isSshProtocol(p: string): boolean {
  return p === "ssh" || p === "ssh-cf";
}

function localEndpoint(conn: Connection): string {
  const isCf = conn.protocol === "rdp-cf" || conn.protocol === "ssh-cf";
  return isCf ? `localhost:${conn.port}` : `${conn.hostname}:${conn.port}`;
}

// Show/hide the SSH key field based on selected protocol.
function updateSshKeyVisibility() {
  const proto = protocolInput.value;
  sshKeyGroup.style.display = isSshProtocol(proto) ? "" : "none";
}

protocolInput.addEventListener("change", () => {
  portInput.value = String(PROTOCOL_DEFAULT_PORTS[protocolInput.value] ?? 3389);
  updateSshKeyVisibility();
});

sshKeyBrowseBtn.addEventListener("click", async () => {
  const picked = await window.api.pickFile({
    title: "Select SSH Key File",
    filters: [
      { name: "Key Files", extensions: ["pem", "ppk", "key", "pub"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (picked) sshKeyPathInput.value = picked;
});

sshKeyClearBtn.addEventListener("click", () => {
  sshKeyPathInput.value = "";
});

// ─── Log ──────────────────────────────────────────────────────────────────────

function appendLog(message: string) {
  const emptyEl = activityLog.querySelector(".log-empty");
  if (emptyEl) emptyEl.remove();

  const entry = document.createElement("div");
  entry.className = "log-entry";
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const timeSpan = document.createElement("span");
  timeSpan.className = "log-time";
  timeSpan.textContent = time;
  const msgSpan = document.createElement("span");
  msgSpan.className = "log-msg";
  msgSpan.textContent = message;
  entry.append(timeSpan, msgSpan);
  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;
}

logClearBtn.addEventListener("click", () => {
  activityLog.innerHTML = '<div class="log-empty">No activity yet.</div>';
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatus(id: string): ConnectionStatus {
  return statuses[id] || "disconnected";
}

function statusLabel(status: ConnectionStatus): string {
  if (status === "connected") return "Connected";
  if (status === "connecting") return "Connecting…";
  return "Idle";
}

function connName(id: string): string {
  const c = connections.find((x) => x.id === id);
  return c ? c.friendlyName || c.hostname : id.slice(0, 8);
}

function isModalOpen(): boolean {
  return (
    !formModal.classList.contains("hidden") || !confirmModal.classList.contains("hidden")
  );
}

function isEditing(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

// ─── Debug Helpers ────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}

function latencyClass(ms: number | null): string {
  if (ms === null) return "debug-val--bad";
  if (ms < 60) return "debug-val--good";
  if (ms < 180) return "debug-val--warn";
  return "debug-val--bad";
}

function latencyLabel(ms: number | null): string {
  if (ms === null) return "timeout";
  return `${ms} ms`;
}

function stopDebugPoll() {
  debugPollRunning = false;
  if (debugPollTimer !== null) {
    clearTimeout(debugPollTimer);
    debugPollTimer = null;
  }
}

function startDebugPoll(connId: string) {
  stopDebugPoll();
  if (getStatus(connId) !== "connected") return;
  debugPollRunning = true;
  const tick = async () => {
    if (!debugPollRunning) return;
    await updateDebugStats(connId);
    if (debugPollRunning) debugPollTimer = setTimeout(tick, 2000);
  };
  void tick();
}

type LiveState = "live" | "warn" | "dim" | "bad";

function setLiveIndicator(text: string, state: LiveState = "live") {
  const el = document.getElementById("debug-live-indicator");
  if (!el) return;
  el.textContent = `● ${text}`;
  el.className = state === "live" ? "debug-live" : `debug-live debug-live--${state}`;
}

async function updateDebugStats(connId: string) {
  const panel = document.getElementById("debug-stats");
  if (!panel) {
    stopDebugPoll();
    return;
  }

  if (getStatus(connId) !== "connected") {
    stopDebugPoll();
    setLiveIndicator("not connected", "dim");
    const conn = connections.find((c) => c.id === connId);
    panel.innerHTML = `
      <div class="debug-row">
        <span class="debug-key">Tunnel</span>
        <span class="debug-val">${conn ? escapeHtml(conn.friendlyName || conn.hostname) : "—"}</span>
      </div>
      <div class="debug-row">
        <span class="debug-key">Status</span>
        <span class="debug-val debug-val--dim">Not connected</span>
      </div>`;
    return;
  }

  const rdpOpen = !rdpClosed.has(connId);

  try {
    const s = await window.api.getTunnelStats(connId);
    const conn = connections.find((c) => c.id === connId);

    if (!s) {
      setLiveIndicator("no process", "warn");
      panel.innerHTML = `
        <div class="debug-row">
          <span class="debug-key">Tunnel</span>
          <span class="debug-val">${conn ? escapeHtml(conn.friendlyName || conn.hostname) : "—"}</span>
        </div>
        <div class="debug-row">
          <span class="debug-key">Status</span>
          <span class="debug-val debug-val--dim">No active tunnel process</span>
        </div>`;
      return;
    }

    const proto = s.protocol || conn?.protocol || "rdp-cf";
    const isCfTunnel = proto === "rdp-cf" || proto === "ssh-cf";
    const isRdpCf = proto === "rdp-cf";
    const isRdpProto = proto === "rdp-cf" || proto === "rdp";

    let liveState: LiveState;
    let liveText: string;
    if (!s.alive) {
      liveState = "bad";
      liveText = "dead";
    } else if (isRdpCf && !rdpOpen) {
      liveState = "warn";
      liveText = "rdp closed";
    } else {
      liveState = "live";
      liveText = "live";
    }
    setLiveIndicator(liveText, liveState);

    const row = (key: string, val: string, cls = "") =>
      `<div class="debug-row">
        <span class="debug-key">${escapeHtml(key)}</span>
        <span class="debug-val${cls ? ` ${cls}` : ""}">${val}</span>
      </div>`;
    const section = (label: string) =>
      `<div class="debug-section">${escapeHtml(label)}</div>`;
    const dim = (v: string) => `<span class="debug-val--dim">${v}</span>`;

    const connSection = [
      section("Connection"),
      row("Tunnel", escapeHtml(conn ? conn.friendlyName || conn.hostname : "—")),
      row("Protocol", escapeHtml(protocolLabel(proto))),
      row(isCfTunnel ? "Tunnel bind" : "Endpoint", escapeHtml(s.localEndpoint)),
      row("Remote host", escapeHtml(s.hostname)),
      conn?.username ? row("Username", escapeHtml(conn.username)) : "",
    ].join("");

    const sessionSection = [
      section("Session"),
      row("Connected at", formatAbsTime(s.connectedAt)),
      row("Uptime", s.uptime !== null ? formatUptime(s.uptime) : "—"),
    ].join("");

    const rttSection = [
      section("Network · Round-trip"),
      row("Current", latencyLabel(s.latency), latencyClass(s.latency)),
      row("Min", s.latencyMin !== null ? `${s.latencyMin} ms` : "—"),
      row("Max", s.latencyMax !== null ? `${s.latencyMax} ms` : "—"),
      row("Average", s.latencyAvg !== null ? `${s.latencyAvg} ms` : "—"),
      row("Jitter", s.latencyJitter !== null ? `±${s.latencyJitter} ms` : "—"),
      row("Samples", `${s.latencySamples} / ${s.latencyHistoryMax}`, "debug-val--dim"),
    ].join("");

    const cfSection = isCfTunnel
      ? [
          section("Cloudflared"),
          row(
            "Status",
            s.alive ? "running" : "dead",
            s.alive ? "debug-val--good" : "debug-val--bad",
          ),
          row(
            "Version",
            s.cloudflaredVersion ? escapeHtml(s.cloudflaredVersion) : dim("unknown"),
          ),
          s.pid !== null ? row("PID", String(s.pid), "debug-val--dim") : "",
          row("Memory", formatBytes(s.cloudflaredMemBytes)),
        ].join("")
      : "";

    const rdpSection = isRdpProto
      ? [
          section("RDP Client"),
          isRdpCf
            ? row(
                "Window",
                rdpOpen ? "open" : "closed",
                rdpOpen ? "debug-val--good" : "debug-val--warn",
              )
            : "",
          s.mstscPid !== null ? row("PID", String(s.mstscPid), "debug-val--dim") : "",
          row("Memory", formatBytes(s.mstscMemBytes)),
        ].join("")
      : "";

    const ipRows = s.localIps.length
      ? s.localIps
          .map((ip) =>
            row("IP", `${escapeHtml(ip.address)} ${dim(`(${escapeHtml(ip.name)})}`)}`),
          )
          .join("")
      : row("IP", dim("none detected"));
    const systemSection = [
      section("System"),
      row("OS", escapeHtml(s.systemOs)),
      row("Hostname", escapeHtml(s.systemHostname)),
      ipRows,
      row("RAM free", formatBytes(s.systemRamFree)),
      row("RAM total", formatBytes(s.systemRamTotal)),
    ].join("");

    panel.innerHTML =
      connSection + sessionSection + rttSection + cfSection + rdpSection + systemSection;
  } catch {
    stopDebugPoll();
    setLiveIndicator("error", "bad");
  }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function renderSidebar() {
  sidebarList.innerHTML = "";

  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? connections.filter(
        (c) =>
          (c.friendlyName || "").toLowerCase().includes(query) ||
          c.hostname.toLowerCase().includes(query) ||
          (c.group || "").toLowerCase().includes(query),
      )
    : connections;

  if (filtered.length === 0) {
    if (connections.length === 0) {
      sidebarList.innerHTML =
        '<div class="sidebar-empty">No tunnels yet.<br>Click "New Tunnel" to get started.</div>';
    } else {
      sidebarList.innerHTML = '<div class="sidebar-empty">No matches found.</div>';
    }
    // Update settings button state
    settingsBtn.classList.toggle("active", settingsView);
    return;
  }

  // Group connections.
  const groups: Map<string, Connection[]> = new Map();
  for (const conn of filtered) {
    const g = conn.group || "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(conn);
  }

  // Sort: named groups alphabetically, then ungrouped last.
  const sortedGroups = [...groups.keys()].sort((a, b) => {
    if (a === "" && b !== "") return 1;
    if (a !== "" && b === "") return -1;
    return a.localeCompare(b);
  });

  for (const groupName of sortedGroups) {
    const groupConns = groups.get(groupName)!;

    if (groupName) {
      const isCollapsed = collapsedGroups.has(groupName);
      const header = document.createElement("div");
      header.className = "sidebar-group-header";
      header.innerHTML = `
        <span class="group-chevron${isCollapsed ? " collapsed" : ""}">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2 3 5 7 8 3"/>
          </svg>
        </span>
        <span class="group-label">${escapeHtml(groupName)}</span>
        <span class="group-count">${groupConns.length}</span>
      `;
      header.addEventListener("click", () => {
        if (collapsedGroups.has(groupName)) {
          collapsedGroups.delete(groupName);
        } else {
          collapsedGroups.add(groupName);
        }
        renderSidebar();
      });
      sidebarList.appendChild(header);
      if (isCollapsed) continue;
    }

    for (const conn of groupConns) {
      const status = getStatus(conn.id);
      const item = document.createElement("div");
      item.className = `tunnel-item ${status}${selectedId === conn.id && !settingsView ? " active" : ""}`;
      item.dataset.id = conn.id;
      item.innerHTML = `
        <div class="tunnel-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2"/>
            <rect x="2" y="14" width="20" height="8" rx="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/>
            <line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
          <span class="tunnel-status-dot"></span>
        </div>
        <div class="tunnel-item-info">
          <div class="tunnel-item-name">${escapeHtml(conn.friendlyName || conn.hostname)}</div>
          <div class="tunnel-item-host">${escapeHtml(conn.hostname)}</div>
        </div>
      `;
      item.addEventListener("click", () => {
        if (selectedId !== conn.id || settingsView) {
          debugMode = false;
          stopDebugPoll();
        }
        settingsView = false;
        selectedId = conn.id;
        renderSidebar();
        renderDetail();
      });
      sidebarList.appendChild(item);
    }
  }

  settingsBtn.classList.toggle("active", settingsView);
}

// ─── Detail ───────────────────────────────────────────────────────────────────

const svgCopy = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

function renderDetail() {
  if (settingsView) {
    renderSettingsPanel();
    return;
  }

  // Heal stale selectedId when the referenced connection no longer exists.
  if (selectedId && !connections.find((c) => c.id === selectedId)) {
    selectedId = connections[0]?.id ?? null;
  }

  if (!selectedId) {
    renderEmptyState();
    return;
  }

  const conn = connections.find((c) => c.id === selectedId)!;
  const status = getStatus(conn.id);
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  const proto = conn.protocol || "rdp-cf";
  const isRdpCf = proto === "rdp-cf";
  const rdpIsDown = isConnected && rdpClosed.has(conn.id) && isRdpCf;
  const isCf = proto === "rdp-cf" || proto === "ssh-cf";
  const endpoint = isCf ? `localhost:${conn.port}` : `${conn.hostname}:${conn.port}`;

  const svgPlay = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const svgStop = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>`;
  const svgRefresh = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
  const svgEdit = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const svgTrash = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  const svgActivity = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;

  let connectActions = "";
  if (!isConnected && !isConnecting) {
    connectActions = `<button class="cmd-btn cmd-primary" data-action="connect" data-id="${conn.id}">${svgPlay} ${escapeHtml(connectLabel(proto))}</button>`;
  } else if (isConnected) {
    if (rdpClosed.has(conn.id) && isRdpCf) {
      connectActions = `<button class="cmd-btn cmd-primary" data-action="reconnect-rdp" data-id="${conn.id}">${svgRefresh} Reconnect RDP</button>`;
    }
    connectActions += `<button class="cmd-btn" data-action="disconnect" data-id="${conn.id}">${svgStop} Disconnect</button>`;
  } else {
    connectActions = `<button class="cmd-btn" disabled><span class="spinner"></span> Connecting&hellip;</button>`;
  }

  const credValue = conn.username
    ? escapeHtml(conn.username) + (conn.hasPassword ? " / ••••••••" : "")
    : conn.hasPassword
      ? "••••••••"
      : "";

  const copyEndpointBtn = isConnected
    ? `<button class="copy-btn" data-action="copy-endpoint" data-id="${conn.id}" data-value="${escapeHtml(endpoint)}" title="Copy endpoint to clipboard">${svgCopy}</button>`
    : "";

  const notesHtml = conn.notes
    ? `<div class="prop-notes">${escapeHtml(conn.notes)}</div>`
    : "";

  const sshKeyRow = conn.hasSshKey
    ? `<div class="prop-row">
           <span class="prop-label">SSH Key</span>
           <span class="prop-value mono">${escapeHtml(conn.sshKeyPath)}</span>
         </div>`
    : "";

  detailPanel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title-row">
        <h1 class="detail-title">${escapeHtml(conn.friendlyName || conn.hostname)}</h1>
        <span class="detail-status-pill ${rdpIsDown ? "rdp-disconnected" : status}">
          <span class="status-dot"></span>
          ${rdpIsDown ? "RDP Disconnected" : statusLabel(status)}
        </span>
      </div>
      <div class="detail-subtitle">${escapeHtml(conn.hostname)}</div>
    </div>

    <div class="command-bar">
      ${connectActions}
      <button class="cmd-btn" data-action="edit" data-id="${conn.id}">${svgEdit} Edit</button>
      <div class="cmd-separator"></div>
      <button class="cmd-btn cmd-danger" data-action="delete" data-id="${conn.id}">${svgTrash} Delete</button>
      <div class="cmd-separator"></div>
      <button class="cmd-btn cmd-debug${debugMode ? " active" : ""}" data-action="toggle-debug" data-id="${conn.id}">${svgActivity} Debug</button>
    </div>

    <div class="prop-section-label">Details</div>
    <div class="prop-list">
      <div class="prop-row">
        <span class="prop-label">Endpoint</span>
        <span class="prop-value mono">${escapeHtml(endpoint)} ${copyEndpointBtn}</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Port</span>
        <span class="prop-value mono">${conn.port}</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Protocol</span>
        <span class="prop-value">${escapeHtml(protocolLabel(proto))}</span>
      </div>
      ${
        conn.username || conn.hasPassword
          ? `<div class="prop-row">
               <span class="prop-label">Credentials</span>
               <span class="prop-value">${credValue}</span>
             </div>`
          : ""
      }
      ${sshKeyRow}
      ${conn.group ? `<div class="prop-row"><span class="prop-label">Group</span><span class="prop-value">${escapeHtml(conn.group)}</span></div>` : ""}
    </div>

    ${notesHtml}

    ${
      debugMode
        ? `
    <div class="debug-panel">
      <div class="debug-header">
        <span class="debug-title">Tunnel Stats</span>
        <span class="${isConnected ? (rdpClosed.has(conn.id) ? "debug-live debug-live--warn" : "debug-live") : "debug-live debug-live--dim"}" id="debug-live-indicator">&#9679; ${isConnected ? (rdpClosed.has(conn.id) ? "rdp closed" : "polling") : "not connected"}</span>
      </div>
      <div class="debug-stats" id="debug-stats">
        <div class="debug-loading">Fetching stats&hellip;</div>
      </div>
    </div>`
        : ""
    }
  `;

  detailPanel.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleAction(btn.dataset.action!, btn.dataset.id!, btn.dataset.value),
    );
  });

  if (debugMode) {
    startDebugPoll(conn.id);
  } else {
    stopDebugPoll();
  }
}

function renderEmptyState() {
  detailPanel.innerHTML = `
    <div class="detail-empty">
      <div class="detail-empty-icon">⚡</div>
      <div class="detail-empty-title">Welcome to TunnelDesk</div>
      <div class="detail-empty-sub">Get started in 3 steps</div>
      <div class="onboarding-steps">
        <div class="onboarding-step">
          <div class="onboarding-step-num">1</div>
          <div class="onboarding-step-body">
            <div class="onboarding-step-title">Install cloudflared</div>
            <div class="onboarding-step-desc">Download from Cloudflare and make sure it's in your system PATH.</div>
            <button class="onboarding-link" data-action="open-cloudflared-docs">Get cloudflared →</button>
          </div>
        </div>
        <div class="onboarding-step">
          <div class="onboarding-step-num">2</div>
          <div class="onboarding-step-body">
            <div class="onboarding-step-title">Add a tunnel</div>
            <div class="onboarding-step-desc">Click <strong>New Tunnel</strong> in the sidebar and enter your hostname and credentials.</div>
          </div>
        </div>
        <div class="onboarding-step">
          <div class="onboarding-step-num">3</div>
          <div class="onboarding-step-body">
            <div class="onboarding-step-title">Connect</div>
            <div class="onboarding-step-desc">Select your tunnel and click Connect. TunnelDesk handles the cloudflared tunnel and launches your client.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  detailPanel.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleAction(btn.dataset.action!, btn.dataset.id ?? "", btn.dataset.value),
    );
  });
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function renderSettingsPanel() {
  const s = currentSettings;
  if (!s) {
    detailPanel.innerHTML = `<div class="detail-empty"><div class="detail-empty-sub">Loading settings…</div></div>`;
    return;
  }

  detailPanel.innerHTML = `
    <div class="settings-panel">
      <div class="detail-header" style="margin-bottom:20px">
        <div class="detail-title-row">
          <h1 class="detail-title">Settings</h1>
        </div>
      </div>

      <div class="prop-section-label">General</div>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Minimize to tray on close</span>
            <span class="settings-desc">Keep TunnelDesk running in the background when you close the window.</span>
          </div>
          <label class="toggle">
            <input type="checkbox" id="s-minimize-tray" ${s.minimizeToTray ? "checked" : ""}>
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Start minimized</span>
            <span class="settings-desc">Launch TunnelDesk directly to the system tray without showing the window.</span>
          </div>
          <label class="toggle">
            <input type="checkbox" id="s-start-minimized" ${s.startMinimized ? "checked" : ""}>
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Default protocol</span>
          </div>
          <select class="form-input settings-select" id="s-default-protocol">
            <option value="rdp-cf" ${s.defaultProtocol === "rdp-cf" ? "selected" : ""}>RDP via Cloudflare Access</option>
            <option value="rdp" ${s.defaultProtocol === "rdp" ? "selected" : ""}>RDP Direct</option>
            <option value="ssh-cf" ${s.defaultProtocol === "ssh-cf" ? "selected" : ""}>SSH via Cloudflare Access</option>
            <option value="ssh" ${s.defaultProtocol === "ssh" ? "selected" : ""}>SSH Direct</option>
          </select>
        </div>
      </div>

      <div class="prop-section-label" style="margin-top:22px">Connections</div>
      <div class="settings-list">
        <div class="settings-row settings-row--col">
          <div class="settings-row-label">
            <span class="settings-label">Cloudflared executable path</span>
            <span class="settings-desc">Leave empty to use cloudflared from your system PATH. Useful for corporate tools directories.</span>
          </div>
          <div class="form-file-row" style="margin-top:8px">
            <input class="form-input" type="text" id="s-cf-path" placeholder="e.g. C:\\tools\\cloudflared.exe" value="${escapeHtml(s.cloudflaredPath)}" autocomplete="off" />
            <button type="button" class="btn btn-secondary btn-sm" id="s-cf-browse">Browse</button>
            <button type="button" class="btn btn-ghost btn-sm" id="s-cf-clear" title="Reset to PATH">&times;</button>
          </div>
        </div>
      </div>

      <div class="prop-section-label" style="margin-top:22px">Activity Log</div>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Log retention</span>
            <span class="settings-desc">Activity log rotates automatically at 512 KB (up to 3 rotated files kept).</span>
          </div>
          <div class="settings-number-row">
            <input class="form-input settings-number" type="number" id="s-log-retention" min="1" max="365" value="${s.logRetentionDays}" />
            <span class="settings-unit">days</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Log file location</span>
            <span class="settings-desc">Open the folder containing the activity log files.</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-open-log">Open Folder</button>
        </div>
      </div>

      <div class="settings-actions">
        <button class="btn btn-primary" id="s-save">Save Settings</button>
      </div>
    </div>
  `;

  const cfPathInput = document.getElementById("s-cf-path") as HTMLInputElement;
  document.getElementById("s-cf-browse")!.addEventListener("click", async () => {
    const picked = await window.api.pickFile({
      title: "Select cloudflared executable",
      filters: [
        { name: "Executable", extensions: ["exe"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (picked) cfPathInput.value = picked;
  });
  document.getElementById("s-cf-clear")!.addEventListener("click", () => {
    cfPathInput.value = "";
  });

  document.getElementById("s-open-log")!.addEventListener("click", async () => {
    await window.api.openLogFolder();
  });

  document.getElementById("s-save")!.addEventListener("click", async () => {
    const minTray = (document.getElementById("s-minimize-tray") as HTMLInputElement)
      .checked;
    const startMin = (document.getElementById("s-start-minimized") as HTMLInputElement)
      .checked;
    const defProto = (document.getElementById("s-default-protocol") as HTMLSelectElement)
      .value;
    const cfPath = cfPathInput.value.trim();
    const logDays =
      parseInt((document.getElementById("s-log-retention") as HTMLInputElement).value) ||
      30;
    try {
      currentSettings = await window.api.saveSettings({
        minimizeToTray: minTray,
        startMinimized: startMin,
        defaultProtocol: defProto,
        cloudflaredPath: cfPath,
        logRetentionDays: logDays,
      });
      showToast("Settings saved.", "success");
    } catch {
      showToast("Failed to save settings.", "error");
    }
  });
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function handleAction(action: string, id: string, value?: string) {
  if (action === "connect") {
    const proto = connections.find((c) => c.id === id)?.protocol ?? "rdp-cf";
    const label = connectLabel(proto);
    appendLog(`${label} — ${connName(id)}`);
    try {
      showToast(`${label}…`, "info");
      await window.api.connect(id);
      const successMsg =
        proto === "http" || proto === "https"
          ? "Opened in browser."
          : proto === "ssh" || proto === "telnet"
            ? `${label} launched.`
            : "Connected — client launched.";
      appendLog(`${label} launched — ${connName(id)}`);
      showToast(successMsg, "success");
    } catch (err) {
      appendLog(`Error: ${errorMsg(err, "Connection failed")} — ${connName(id)}`);
      showToast(errorMsg(err, "Connection failed."), "error");
    }
  } else if (action === "disconnect") {
    try {
      await window.api.disconnect(id);
      showToast("Disconnected.", "success");
    } catch (err) {
      showToast(errorMsg(err, "Disconnect failed."), "error");
    }
  } else if (action === "edit") {
    const conn = connections.find((c) => c.id === id);
    if (!conn) return;
    idInput.value = conn.id;
    nameInput.value = conn.friendlyName || "";
    hostInput.value = conn.hostname;
    portInput.value = String(conn.port);
    protocolInput.value = conn.protocol || "rdp-cf";
    groupInput.value = conn.group || "";
    usernameInput.value = conn.username || "";
    passwordInput.value = "";
    passwordInput.placeholder = conn.hasPassword
      ? "Leave empty to keep existing"
      : "••••••••";
    sshKeyPathInput.value = conn.sshKeyPath || "";
    notesInput.value = conn.notes || "";
    updateSshKeyVisibility();
    formTitle.textContent = "Edit Tunnel";
    openModal();
  } else if (action === "delete") {
    const conn = connections.find((c) => c.id === id);
    const label = conn ? conn.friendlyName || conn.hostname : "this tunnel";
    if (!(await showConfirm(`Delete "${label}"? This cannot be undone.`))) return;
    try {
      const name = connName(id);
      connections = await window.api.deleteConnection(id);
      if (selectedId === id) {
        debugMode = false;
        stopDebugPoll();
        selectedId = connections[0]?.id ?? null;
      }
      renderSidebar();
      renderDetail();
      appendLog(`Tunnel deleted — ${name}`);
      showToast("Tunnel deleted.", "success");
    } catch (err) {
      showToast(errorMsg(err, "Delete failed."), "error");
    }
  } else if (action === "reconnect-rdp") {
    appendLog(`Reconnecting RDP — ${connName(id)}`);
    try {
      rdpClosed.delete(id);
      await window.api.launchRdp(id);
      renderDetail();
      showToast("Remote Desktop launched.", "success");
    } catch (err) {
      rdpClosed.add(id);
      appendLog(`Reconnect failed: ${errorMsg(err, "Unknown error")} — ${connName(id)}`);
      showToast(errorMsg(err, "Failed to launch Remote Desktop."), "error");
    }
  } else if (action === "toggle-debug") {
    debugMode = !debugMode;
    renderDetail();
  } else if (action === "copy-endpoint") {
    const endpoint = value || localEndpoint(connections.find((c) => c.id === id)!);
    try {
      await navigator.clipboard.writeText(endpoint);
      showToast(`Copied ${endpoint}`, "success");
    } catch {
      showToast("Failed to copy.", "error");
    }
  } else if (action === "open-cloudflared-docs") {
    window.api.openExternal(
      "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    );
  }
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmMsg.textContent = message;
    confirmModal.classList.remove("hidden");
    confirmModal.offsetHeight;
    confirmModal.classList.add("open");

    const cleanup = (result: boolean) => {
      confirmModal.classList.remove("open");
      setTimeout(() => confirmModal.classList.add("hidden"), 160);
      confirmOkBtn.removeEventListener("click", onOk);
      confirmCancel.removeEventListener("click", onCancel);
      confirmModal.removeEventListener("click", onBackdrop);
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === confirmModal) cleanup(false);
    };

    confirmOkBtn.addEventListener("click", onOk);
    confirmCancel.addEventListener("click", onCancel);
    confirmModal.addEventListener("click", onBackdrop);
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal() {
  formModal.classList.remove("hidden");
  formModal.offsetHeight;
  formModal.classList.add("open");
  setTimeout(() => nameInput.focus(), 50);
}

function closeModal() {
  formModal.classList.remove("open");
  setTimeout(() => {
    formModal.classList.add("hidden");
    resetForm();
  }, 160);
}

function resetForm() {
  idInput.value = "";
  nameInput.value = "";
  hostInput.value = "";
  portInput.value = String(
    PROTOCOL_DEFAULT_PORTS[currentSettings?.defaultProtocol ?? "rdp-cf"] ?? 3389,
  );
  protocolInput.value = currentSettings?.defaultProtocol ?? "rdp-cf";
  groupInput.value = "";
  usernameInput.value = "";
  passwordInput.value = "";
  passwordInput.placeholder = "••••••••";
  sshKeyPathInput.value = "";
  notesInput.value = "";
  updateSshKeyVisibility();
  formTitle.textContent = "New Tunnel";
}

newBtn.addEventListener("click", () => {
  resetForm();
  openModal();
});
cancelTopBtn.addEventListener("click", closeModal);
cancelBotBtn.addEventListener("click", closeModal);
formModal.addEventListener("click", (e) => {
  if (e.target === formModal) closeModal();
});

saveForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const isEdit = !!idInput.value;
  const conn = {
    id: idInput.value || undefined,
    friendlyName: nameInput.value.trim(),
    hostname: hostInput.value.trim(),
    port: Number(portInput.value) || 3389,
    protocol: protocolInput.value || "rdp-cf",
    username: usernameInput.value.trim() || undefined,
    password: passwordInput.value || undefined,
    keepExistingPassword: isEdit && !passwordInput.value,
    notes: notesInput.value.trim(),
    group: groupInput.value.trim(),
    sshKeyPath: sshKeyPathInput.value.trim(),
  };

  if (!conn.hostname) {
    showToast("Hostname is required.", "error");
    hostInput.focus();
    return;
  }

  try {
    await window.api.saveConnection(conn);
    closeModal();
    await refreshConnections();
    showToast("Tunnel saved.", "success");
  } catch (err) {
    showToast(errorMsg(err, "Failed to save."), "error");
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  renderSidebar();
});

// ─── Settings button ──────────────────────────────────────────────────────────

settingsBtn.addEventListener("click", async () => {
  settingsView = !settingsView;
  if (settingsView) {
    selectedId = null;
    stopDebugPoll();
    debugMode = false;
    // Re-fetch settings each time the panel opens so it reflects current state.
    try {
      currentSettings = await window.api.getSettings();
    } catch {}
  }
  renderSidebar();
  renderDetail();
});

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (isModalOpen() || isEditing()) return;

  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    resetForm();
    openModal();
  } else if (e.ctrlKey && e.key === "d") {
    e.preventDefault();
    if (selectedId && !settingsView) {
      debugMode = !debugMode;
      renderDetail();
    }
  } else if (e.key === "Enter") {
    if (!selectedId || settingsView) return;
    const status = getStatus(selectedId);
    if (status === "disconnected") {
      handleAction("connect", selectedId);
    } else if (status === "connected") {
      handleAction("disconnect", selectedId);
    }
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (!selectedId || settingsView || e.key === "Backspace") return;
    handleAction("delete", selectedId);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    navigateSidebar(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    navigateSidebar(-1);
  }
});

function navigateSidebar(direction: 1 | -1) {
  if (settingsView || connections.length === 0) return;
  const idx = selectedId ? connections.findIndex((c) => c.id === selectedId) : -1;
  const next = Math.max(0, Math.min(connections.length - 1, idx + direction));
  if (connections[next]) {
    settingsView = false;
    selectedId = connections[next].id;
    renderSidebar();
    renderDetail();
  }
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function refreshConnections() {
  try {
    connections = await window.api.loadConnections();
    const loaded = await window.api.getStatuses();
    for (const key of Object.keys(statuses)) delete statuses[key];
    Object.assign(statuses, loaded);
    if (!selectedId && connections.length > 0 && !settingsView) {
      selectedId = connections[0].id;
    }
    renderSidebar();
    renderDetail();
  } catch {
    showToast("Failed to load tunnels.", "error");
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

window.api.onStatusUpdate((data) => {
  const prev = statuses[data.id];
  statuses[data.id] = data.status;
  if (data.status === "disconnected") {
    rdpClosed.delete(data.id);
    if (data.id === selectedId) {
      stopDebugPoll();
      if (debugMode) setLiveIndicator("not connected", "dim");
    }
    if (prev === "connecting") appendLog(`Connection failed — ${connName(data.id)}`);
    else if (prev === "connected")
      appendLog(`Tunnel disconnected — ${connName(data.id)}`);
  } else if (data.status === "connected" && prev !== "connected") {
    appendLog(`Tunnel connected — ${connName(data.id)}`);
  }
  renderSidebar();
  renderDetail();
});

window.api.onRdpClosed((data) => {
  rdpClosed.add(data.id);
  appendLog(`RDP window closed — ${connName(data.id)}`);
  if (data.id === selectedId) renderDetail();
});

window.api.onLog((data) => {
  const name = data.id ? connName(data.id) : null;
  const prefix = name ? `[${name}] ` : "";
  appendLog(prefix + data.message);
});

window.api.onDepsStatus((deps) => {
  const missing: string[] = [];
  if (!deps.cloudflared) missing.push("cloudflared");
  if (!deps.mstsc) missing.push("mstsc (Remote Desktop)");

  if (missing.length > 0) {
    const list = missing.join(" and ");
    const fix = !deps.cloudflared
      ? " Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
      : "";
    depsWarningText.textContent = `Missing required tool${missing.length > 1 ? "s" : ""}: ${list}. Connections will not work until installed.${fix}`;
    depsWarning.classList.remove("hidden");
  } else {
    depsWarning.classList.add("hidden");
  }
});

depsWarningDismiss.addEventListener("click", () => {
  depsWarning.classList.add("hidden");
});

window.api.onAuthRequired((data) => {
  appendLog(`Cloudflare Access login required — ${connName(data.id)}`);
  showToast("Browser login required — complete sign-in in your browser.", "info");
  renderDetail();
});

// ─── Utils ────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ─── Global renderer error traps ─────────────────────────────────────────────

window.addEventListener("unhandledrejection", (e) => {
  const msg =
    e.reason instanceof Error ? e.reason.message : String(e.reason ?? "unknown error");
  appendLog(`Unhandled error: ${msg}`);
  e.preventDefault();
});

window.addEventListener("error", (e) => {
  appendLog(`Script error: ${e.message}`);
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    currentSettings = await window.api.getSettings();
  } catch {}
  await refreshConnections();
}

init();
