import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";

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
  hasSshKeyPassphrase: boolean;
  jumpHost: string;
  jumpPort: number | null;
  temp: boolean;
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
  pinnedIds: string[];
  sftpDownloadFolder: string;
  theme: "dark" | "light" | "system";
  connectionOrder: string[];
  autoReconnect: boolean;
  autoReconnectAttempts: number;
}

type TermTabType = "term" | "sftp";

interface SftpEntry {
  name: string;
  size: number;
  isDir: boolean;
  isSymlink: boolean;
  mode: number;
  mtime: number;
}

interface TermTab {
  tabId: string;
  type: TermTabType;
  sessionId: string | null;
  label: string;
  term: Terminal | null;
  fitAddon: FitAddon | null;
  el: HTMLDivElement; // persistent DOM element — moved in/out of detailPanel
  closed: boolean;
  cancelled: boolean; // closed while still connecting (sessionId was null)
  error: string | null;
  fontSize: number;
  // sftp state
  sftpPath: string;
  sftpEntries: SftpEntry[];
  sftpLoading: boolean;
  sftpSelected: string | null;
  sftpShowHidden: boolean;
  sftpStatus: string | null;
  sftpStatusTimer: ReturnType<typeof setTimeout> | null;
  sftpEditingPath: boolean;
  multiSelected: Set<string>;
  searchAddon: SearchAddon | null;
  searchVisible: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface ConnTermState {
  tabs: TermTab[];
  activeTabId: string | null;
  osInfo: string;
}

declare global {
  interface Window {
    api: {
      platform: string;
      loadConnections(): Promise<Connection[]>;
      saveConnection(conn: {
        id?: string;
        friendlyName: string;
        hostname: string;
        port: number;
        username?: string;
        password?: string;
        keepExistingPassword?: boolean;
        sshKeyPassphrase?: string;
        keepExistingSshKeyPassphrase?: boolean;
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
      openTermWindow(connId: string, label: string): Promise<void>;
      openFormWindow(connId?: string | null): Promise<void>;
      sshReportStatus(connId: string, ok: boolean): Promise<void>;
      onStatusUpdate(cb: (data: { id: string; status: ConnectionStatus }) => void): void;
      onLog(cb: (data: { id?: string; message: string }) => void): void;
      onRdpClosed(cb: (data: { id: string }) => void): void;
      onRdpReconnected(cb: (data: { id: string }) => void): void;
      telnetTermCreate(connectionId: string): Promise<string>;
      telnetWrite(sid: string, data: string): Promise<void>;
      telnetResize(sid: string, cols: number, rows: number): Promise<void>;
      telnetCloseSession(sid: string): Promise<void>;
      sshTermCreate(connectionId: string): Promise<{ sid: string; osInfo: string }>;
      sshSftpCreate(connectionId: string): Promise<string>;
      sshWrite(sid: string, data: string): Promise<void>;
      sshResize(sid: string, cols: number, rows: number): Promise<void>;
      sshCloseSession(sid: string): Promise<void>;
      cancelSshConnect(connId: string): Promise<void>;
      exportConnections(): Promise<{ canceled?: boolean; count?: number }>;
      importConnections(): Promise<{ canceled?: boolean; added?: number }>;
      showNotification(title: string, body: string): Promise<void>;
      testHttp(
        url: string,
      ): Promise<{ statusCode: number | null; timeMs: number; error?: string }>;
      deleteTempConnections(): Promise<void>;
      sftpList(sid: string, remotePath: string): Promise<SftpEntry[]>;
      sftpHome(sid: string): Promise<string>;
      sftpDownload(
        sid: string,
        remotePath: string,
      ): Promise<{ canceled?: boolean; filePath?: string }>;
      sftpUpload(
        sid: string,
        remotePath: string,
      ): Promise<{ canceled?: boolean; dest?: string }>;
      sftpDelete(sid: string, remotePath: string, isDir: boolean): Promise<void>;
      sftpRename(sid: string, oldPath: string, newPath: string): Promise<void>;
      sftpMkdir(sid: string, remotePath: string): Promise<void>;
      sftpUploadPath(
        sid: string,
        localPath: string,
        remotePath: string,
      ): Promise<{ dest: string }>;
      onSshData(cb: (d: { sid: string; data: string }) => void): void;
      onSshClose(
        cb: (d: { sid: string; code: number | null; signal: string | null }) => void,
      ): void;
      onDepsStatus(
        cb: (data: {
          cloudflared: boolean;
          mstsc: boolean;
          rdpClient?: string;
          rdpClientFound?: boolean;
        }) => void,
      ): void;
      onAuthRequired(cb: (data: { id: string; url: string }) => void): void;
      onConnectionSaved(cb: () => void): void;
    };
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let connections: Connection[] = [];
const statuses: Record<string, ConnectionStatus> = {};
const rdpClosed = new Set<string>();
const authPendingUrls = new Map<string, string>(); // connectionId -> auth URL
const sessionConnectedAt = new Map<string, number>(); // connectionId -> timestamp ms
let selectedId: string | null = null;
let debugMode = false;
let debugPollTimer: ReturnType<typeof setTimeout> | null = null;
let debugPollRunning = false;
let settingsView = false;
let searchQuery = "";
const collapsedGroups = new Set<string>();
let currentSettings: Settings | null = null;
const systemThemeMq = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(theme: "dark" | "light" | "system") {
  const resolved =
    theme === "system" ? (systemThemeMq.matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
}

systemThemeMq.addEventListener("change", () => {
  if (currentSettings?.theme === "system") applyTheme("system");
});

// ─── Terminal window mode ─────────────────────────────────────────────────────
// When loaded with ?mode=terminal&connId=<id> we render only the terminal view,
// hiding the main app layout. Computed once at module load from the URL.
const _twParams = new URLSearchParams(window.location.search);
const IS_TERMINAL_WINDOW = _twParams.get("mode") === "terminal";
const TERM_WIN_CONN_ID = IS_TERMINAL_WINDOW ? (_twParams.get("connId") ?? null) : null;
const IS_FORM_WINDOW = _twParams.get("mode") === "form";
const FORM_WIN_CONN_ID = IS_FORM_WINDOW ? (_twParams.get("connId") ?? null) : null;

// ─── Terminal state ───────────────────────────────────────────────────────────
// Keyed by connectionId; values survive re-renders so xterm instances aren't recreated.
const termState = new Map<string, ConnTermState>();
// Reverse map: sessionId → { connId, tabId } for routing ssh-data events.
const sidToTab = new Map<string, { connId: string; tabId: string }>();
// Track which sids are Telnet sessions (vs SSH) for routing write/close IPC.
const telnetSids = new Set<string>();
let termTabCounter = 0;

function genTabId(): string {
  return `tab-${++termTabCounter}`;
}

const xtermTheme = {
  background: "#1b1b1b",
  foreground: "rgba(255,255,255,0.92)",
  cursor: "rgba(255,255,255,0.8)",
  cursorAccent: "#1b1b1b",
  selectionBackground: "rgba(255,255,255,0.2)",
  black: "#000000",
  red: "#f85149",
  green: "#6ccb5f",
  yellow: "#f9a825",
  blue: "#4d9ef5",
  magenta: "#bc8cff",
  cyan: "#56d4dd",
  white: "#d4d4d4",
  brightBlack: "#666666",
  brightRed: "#f97f76",
  brightGreen: "#89d185",
  brightYellow: "#ffcc02",
  brightBlue: "#6dbeff",
  brightMagenta: "#d0b0ff",
  brightCyan: "#7ad9f1",
  brightWhite: "#ffffff",
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────

const sidebarList = document.getElementById("sidebar-list") as HTMLElement;
let detailPanel = document.getElementById("detail-panel") as HTMLElement;
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
const sshKeyPassphraseInput = document.getElementById(
  "ssh-key-passphrase",
) as HTMLInputElement;
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

// ─── SFTP Helpers ─────────────────────────────────────────────────────────────

function formatMtime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const mo = d.toLocaleString("default", { month: "short" });
  const day = String(d.getDate()).padStart(2, " ");
  if (sameYear) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${mo} ${day}  ${hh}:${mm}`;
  }
  return `${mo} ${day}  ${d.getFullYear()}`;
}

type SftpIconKind =
  | "folder"
  | "symlink"
  | "image"
  | "archive"
  | "code"
  | "config"
  | "text"
  | "pdf"
  | "binary";

function sftpIconKind(entry: SftpEntry): SftpIconKind {
  if (entry.isDir) return "folder";
  if (entry.isSymlink) return "symlink";
  const ext = (entry.name.split(".").pop() ?? "").toLowerCase();
  if (
    [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "svg",
      "webp",
      "ico",
      "bmp",
      "tiff",
      "tif",
      "heic",
    ].includes(ext)
  )
    return "image";
  if (
    [
      "zip",
      "tar",
      "gz",
      "bz2",
      "xz",
      "rar",
      "7z",
      "deb",
      "rpm",
      "pkg",
      "apk",
      "tgz",
      "tbz2",
      "lzma",
      "zst",
    ].includes(ext)
  )
    return "archive";
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "sh",
      "bash",
      "zsh",
      "fish",
      "c",
      "cpp",
      "h",
      "hpp",
      "java",
      "go",
      "rs",
      "rb",
      "php",
      "lua",
      "r",
      "swift",
      "kt",
      "cs",
      "vb",
      "pl",
      "ps1",
      "bat",
      "cmd",
      "awk",
      "sed",
    ].includes(ext)
  )
    return "code";
  if (
    [
      "json",
      "yaml",
      "yml",
      "toml",
      "xml",
      "ini",
      "conf",
      "cfg",
      "env",
      "properties",
      "plist",
      "htaccess",
      "gitignore",
      "dockerignore",
    ].includes(ext)
  )
    return "config";
  if (
    ["txt", "md", "rst", "log", "csv", "tsv", "readme", "nfo", "diff", "patch"].includes(
      ext,
    )
  )
    return "text";
  if (ext === "pdf") return "pdf";
  return "binary";
}

const SFTP_ICON_SVG: Record<SftpIconKind, string> = {
  folder: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 4.5C1 3.67 1.67 3 2.5 3H6l1.5 1.5H13.5C14.33 4.5 15 5.17 15 6V12.5C15 13.33 14.33 14 13.5 14h-11C1.67 14 1 13.33 1 12.5V4.5Z" fill="#5b9bd5" opacity="0.85"/></svg>`,
  symlink: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8.5 7.5 4v3c3.5 0 5.5 1.5 5.5 5-.8-2-2.5-2.5-5.5-2.5v3L3 8.5Z" fill="#56d1c7"/></svg>`,
  image: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="#9d7dea" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.25" fill="#9d7dea"/><path d="M1.5 11 5 7.5l2.5 2.5 2-2L14.5 12" stroke="#9d7dea" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  archive: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="#e0a057" stroke-width="1.3"/><line x1="5" y1="2" x2="5" y2="14" stroke="#e0a057" stroke-width="1.3"/><line x1="5" y1="5" x2="7.5" y2="5" stroke="#e0a057" stroke-width="1.3"/><line x1="5" y1="8" x2="7.5" y2="8" stroke="#e0a057" stroke-width="1.3"/><line x1="5" y1="11" x2="7.5" y2="11" stroke="#e0a057" stroke-width="1.3"/></svg>`,
  code: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 4.5 1.5 8 5 11.5M11 4.5 14.5 8 11 11.5M9.5 3 6.5 13" stroke="#6ccb5f" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  config: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="5.5" stroke="#f5a97f" stroke-width="1.3"/><circle cx="8" cy="8" r="2" stroke="#f5a97f" stroke-width="1.3"/><line x1="8" y1="2" x2="8" y2="3.5" stroke="#f5a97f" stroke-width="1.3"/><line x1="8" y1="12.5" x2="8" y2="14" stroke="#f5a97f" stroke-width="1.3"/><line x1="2" y1="8" x2="3.5" y2="8" stroke="#f5a97f" stroke-width="1.3"/><line x1="12.5" y1="8" x2="14" y2="8" stroke="#f5a97f" stroke-width="1.3"/></svg>`,
  text: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="#a0a0a0" stroke-width="1.3"/><line x1="5" y1="5.5" x2="11" y2="5.5" stroke="#a0a0a0" stroke-width="1.2" stroke-linecap="round"/><line x1="5" y1="8" x2="11" y2="8" stroke="#a0a0a0" stroke-width="1.2" stroke-linecap="round"/><line x1="5" y1="10.5" x2="8.5" y2="10.5" stroke="#a0a0a0" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  pdf: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="#f85149" stroke-width="1.3"/><text x="8" y="10.5" text-anchor="middle" fill="#f85149" font-size="5" font-weight="700" font-family="sans-serif">PDF</text></svg>`,
  binary: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="rgba(255,255,255,0.25)" stroke-width="1.3"/><line x1="5" y1="5.5" x2="11" y2="5.5" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" stroke-linecap="round"/><line x1="5" y1="8" x2="11" y2="8" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" stroke-linecap="round"/><line x1="5" y1="10.5" x2="11" y2="10.5" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" stroke-linecap="round"/></svg>`,
};

// Join POSIX-style remote paths safely (avoids Windows path.join).
function sftpJoin(...parts: string[]): string {
  const joined = parts.join("/").replace(/\/+/g, "/");
  return joined || "/";
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

// Show/hide the SSH key and jump host fields based on selected protocol.
function updateSshKeyVisibility() {
  const proto = protocolInput.value;
  const isSsh = isSshProtocol(proto);
  sshKeyGroup.style.display = isSsh ? "" : "none";
  const jumpGroup = document.getElementById("jump-host-group");
  if (jumpGroup) jumpGroup.style.display = isSsh ? "" : "none";
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

function wireRevealBtn(btnId: string, inputEl: HTMLInputElement) {
  const btn = document.getElementById(btnId) as HTMLButtonElement | null;
  if (!btn) return;
  btn.addEventListener("click", () => {
    const isRevealed = inputEl.type === "text";
    inputEl.type = isRevealed ? "password" : "text";
    btn.classList.toggle("revealing", !isRevealed);
  });
}
wireRevealBtn("toggle-password", passwordInput);
wireRevealBtn("toggle-passphrase", sshKeyPassphraseInput);

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
  const allEntries = activityLog.querySelectorAll(".log-entry");
  if (allEntries.length > 500) allEntries[0].remove();
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

// ─── Dropdown menu helper ─────────────────────────────────────────────────────

type MenuEntry =
  | { separator: true }
  | { label: string; disabled?: boolean; action: () => void };

function showDropdownMenu(x: number, y: number, items: MenuEntry[]): void {
  const old = document.getElementById("_td-dropdown");
  if (old) old.remove();

  const menu = document.createElement("div");
  menu.id = "_td-dropdown";
  menu.style.cssText =
    "position:fixed;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-sm);z-index:9999;min-width:160px;padding:4px 0;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.4)";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const dismiss = () => {
    if (document.body.contains(menu)) document.body.removeChild(menu);
    document.removeEventListener("mousedown", onOut);
  };
  const onOut = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) dismiss();
  };

  for (const entry of items) {
    if ("separator" in entry) {
      const sep = document.createElement("div");
      sep.style.cssText = "height:1px;background:var(--border);margin:4px 0;";
      menu.appendChild(sep);
      continue;
    }
    const el = document.createElement("div");
    el.style.cssText = `padding:7px 14px;cursor:${entry.disabled ? "default" : "pointer"};opacity:${entry.disabled ? "0.4" : "1"};`;
    el.textContent = entry.label;
    if (!entry.disabled) {
      el.addEventListener("mouseenter", () => {
        el.style.background = "var(--bg-hover)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.background = "";
      });
      el.addEventListener("click", () => {
        dismiss();
        entry.action();
      });
    }
    menu.appendChild(el);
  }

  document.body.appendChild(menu);
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth)
      menu.style.left = `${Math.max(0, x - rect.width)}px`;
    if (rect.bottom > window.innerHeight)
      menu.style.top = `${Math.max(0, y - rect.height)}px`;
  });
  setTimeout(() => {
    if (document.body.contains(menu)) document.addEventListener("mousedown", onOut);
  }, 0);
}

// Lightweight prompt dialog (window.prompt is blocked in sandboxed Electron).
function showPrompt(message: string, defaultValue: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius);padding:20px;min-width:300px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.4);";

    const msg = document.createElement("p");
    msg.style.cssText = "margin:0 0 10px;font-size:13px;color:var(--text);";
    msg.textContent = message;

    const input = document.createElement("input");
    input.type = "text";
    input.value = defaultValue;
    input.className = "form-input";
    input.style.cssText = "width:100%;margin-bottom:12px;box-sizing:border-box;";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-ghost";
    cancelBtn.textContent = "Cancel";
    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-primary";
    okBtn.textContent = "OK";

    actions.append(cancelBtn, okBtn);
    box.append(msg, input, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const cleanup = (result: string | null) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    okBtn.addEventListener("click", () => cleanup(input.value.trim() || null));
    cancelBtn.addEventListener("click", () => cleanup(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(null);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") cleanup(input.value.trim() || null);
      if (e.key === "Escape") cleanup(null);
    });
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

// ─── Terminal management ──────────────────────────────────────────────────────

function getOrInitTermState(connId: string): ConnTermState {
  if (!termState.has(connId)) termState.set(connId, { tabs: [], activeTabId: null, osInfo: "unknown" });
  return termState.get(connId)!;
}

function makeTabEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "term-panel";
  return el;
}

async function addTermTab(connId: string, type: TermTabType): Promise<void> {
  const state = getOrInitTermState(connId);
  const tabId = genTabId();
  const label =
    type === "sftp"
      ? "File Transfer"
      : `Terminal ${state.tabs.filter((t) => t.type === "term").length + 1}`;
  const el = makeTabEl();

  const tab: TermTab = {
    tabId,
    type,
    sessionId: null,
    label,
    term: null,
    fitAddon: null,
    el,
    closed: false,
    cancelled: false,
    error: null,
    fontSize: 13,
    sftpPath: "/",
    sftpEntries: [],
    sftpLoading: type === "sftp", // start spinner immediately for SFTP tabs
    sftpSelected: null,
    sftpShowHidden: false,
    sftpStatus: null,
    sftpStatusTimer: null,
    sftpEditingPath: false,
    multiSelected: new Set<string>(),
    searchAddon: null,
    searchVisible: false,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectTimer: null,
  };
  state.tabs.push(tab);
  state.activeTabId = tabId;

  if (type === "term") {
    const term = new Terminal({
      theme: xtermTheme,
      fontFamily: '"Cascadia Code", "Consolas", "Monaco", monospace',
      fontSize: tab.fontSize,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.open(el);
    tab.term = term;
    tab.fitAddon = fitAddon;
    tab.searchAddon = searchAddon;

    // Ctrl+F = toggle search
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey || e.shiftKey || e.altKey) return true;
      if (e.key === "f" || e.key === "F") {
        tab.searchVisible = !tab.searchVisible;
        if (!tab.searchVisible) tab.searchAddon?.clearDecorations();
        const c = connections.find((c) => c.id === connId);
        if (c) renderTerminalDetail(c);
        return false;
      }
      return true;
    });

    // Font zoom: Ctrl++ / Ctrl+= / Ctrl+- / Ctrl+0
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey || e.shiftKey || e.altKey) return true;
      if (e.key === "=" || e.key === "+") {
        tab.fontSize = Math.min(28, tab.fontSize + 1);
        term.options.fontSize = tab.fontSize;
        fitAddon.fit();
        return false;
      }
      if (e.key === "-") {
        tab.fontSize = Math.max(8, tab.fontSize - 1);
        term.options.fontSize = tab.fontSize;
        fitAddon.fit();
        return false;
      }
      if (e.key === "0") {
        tab.fontSize = 13;
        term.options.fontSize = tab.fontSize;
        fitAddon.fit();
        return false;
      }
      // Ctrl+Shift+C / Ctrl+Shift+V handled below via shiftKey check — skip here.
      return true;
    });

    // Ctrl+Shift+C = copy, Ctrl+Shift+V = paste
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey || !e.shiftKey) return true;
      if (e.key === "C") {
        const sel = term.getSelection();
        if (sel) void navigator.clipboard.writeText(sel);
        return false;
      }
      if (e.key === "V") {
        void navigator.clipboard.readText().then((text) => {
          if (!text || !tab.sessionId) return;
          const sid = tab.sessionId;
          const send = telnetSids.has(sid)
            ? (d: string) => void window.api.telnetWrite(sid, d)
            : (d: string) => void window.api.sshWrite(sid, d);
          for (let i = 0; i < text.length; i += 1024) send(text.slice(i, i + 1024));
        });
        return false;
      }
      return true;
    });

    // Right-click context menu: copy / paste / zoom
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const sel = term.getSelection();
      showDropdownMenu(e.clientX, e.clientY, [
        {
          label: sel ? "Copy" : "Copy (no selection)",
          disabled: !sel,
          action: () => {
            if (sel) void navigator.clipboard.writeText(sel);
          },
        },
        {
          label: "Paste",
          action: () => {
            void navigator.clipboard.readText().then((text) => {
              if (!text || !tab.sessionId) return;
              const sid = tab.sessionId;
              const send = telnetSids.has(sid)
                ? (d: string) => void window.api.telnetWrite(sid, d)
                : (d: string) => void window.api.sshWrite(sid, d);
              for (let i = 0; i < text.length; i += 1024) send(text.slice(i, i + 1024));
            });
          },
        },
        { separator: true },
        {
          label: "Zoom In",
          disabled: tab.fontSize >= 28,
          action: () => {
            tab.fontSize = Math.min(28, tab.fontSize + 1);
            term.options.fontSize = tab.fontSize;
            fitAddon.fit();
          },
        },
        {
          label: "Zoom Out",
          disabled: tab.fontSize <= 8,
          action: () => {
            tab.fontSize = Math.max(8, tab.fontSize - 1);
            term.options.fontSize = tab.fontSize;
            fitAddon.fit();
          },
        },
        {
          label: "Reset Zoom",
          disabled: tab.fontSize === 13,
          action: () => {
            tab.fontSize = 13;
            term.options.fontSize = tab.fontSize;
            fitAddon.fit();
          },
        },
      ]);
    });
  }

  // Render the shell immediately (tab bar appears, session shows loading state).
  if (selectedId === connId) {
    const c = connections.find((c) => c.id === connId);
    if (c) renderTerminalDetail(c);
  }

  // For ssh-direct and telnet, the main process leaves status at "connecting"
  // until we confirm the session succeeded or failed via ssh-report-status.
  const connProtocol = connections.find((c) => c.id === connId)?.protocol ?? "";
  const isTelnet = connProtocol === "telnet";
  const isDirectProtocol = connProtocol === "ssh" || isTelnet;

  try {
    if (type === "term") {
      let sid: string;
      if (isTelnet) {
        sid = await window.api.telnetTermCreate(connId);
        const st = termState.get(connId);
        if (st) st.osInfo = "telnet";
      } else {
        const result = await window.api.sshTermCreate(connId);
        sid = result.sid;
        const st = termState.get(connId);
        if (st) st.osInfo = result.osInfo;
      }

      if (tab.cancelled) {
        // Tab was closed while connecting — kill the session immediately.
        void (isTelnet
          ? window.api.telnetCloseSession(sid)
          : window.api.sshCloseSession(sid));
        return;
      }
      tab.sessionId = sid;
      sidToTab.set(sid, { connId, tabId });

      if (isTelnet) {
        telnetSids.add(sid);
        tab.term!.onData((data) => void window.api.telnetWrite(sid, data));
        tab.term!.onResize(
          ({ cols, rows }) => void window.api.telnetResize(sid, cols, rows),
        );
      } else {
        tab.term!.onData((data) => window.api.sshWrite(sid, data));
        tab.term!.onResize(({ cols, rows }) => window.api.sshResize(sid, cols, rows));
      }

      tab.fitAddon!.fit();
      if (isDirectProtocol) void window.api.sshReportStatus(connId, true);
    } else {
      const sid = await window.api.sshSftpCreate(connId);
      if (tab.cancelled) {
        void window.api.sshCloseSession(sid);
        return;
      }
      tab.sessionId = sid;
      sidToTab.set(sid, { connId, tabId });
      try {
        tab.sftpPath = await window.api.sftpHome(sid);
        tab.sftpEntries = await window.api.sftpList(sid, tab.sftpPath);
      } catch (e) {
        tab.error = e instanceof Error ? e.message : String(e);
      }
      tab.sftpLoading = false;
      // SFTP tabs never drive connection status — only the terminal tab does.
    }
  } catch (err) {
    if (tab.cancelled) return; // status already reset by closeTermTab
    let msg = err instanceof Error ? err.message : String(err);
    // Electron wraps IPC rejections with "Error invoking remote method '...': Error: ..."
    msg = msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
    tab.error = msg;
    tab.closed = true;
    // Only terminal tabs own the direct-protocol connection status.
    if (isDirectProtocol && type === "term")
      void window.api.sshReportStatus(connId, false);
  }

  if (selectedId === connId) {
    const c = connections.find((c) => c.id === connId);
    if (c) renderTerminalDetail(c);
  }
}

function closeTermTab(connId: string, tabId: string): void {
  const state = termState.get(connId);
  if (!state) return;
  const tab = state.tabs.find((t) => t.tabId === tabId);
  if (!tab) return;
  if (tab.sessionId) {
    const sid = tab.sessionId;
    sidToTab.delete(sid);
    const isTelnetSid = telnetSids.has(sid);
    telnetSids.delete(sid);
    void (isTelnetSid
      ? window.api.telnetCloseSession(sid)
      : window.api.sshCloseSession(sid));
    // For direct-protocol connections: report disconnect if no other live term tabs remain.
    const proto = connections.find((c) => c.id === connId)?.protocol;
    if ((proto === "ssh" || proto === "telnet") && tab.type === "term") {
      const remaining = state.tabs.filter(
        (t) => t.tabId !== tabId && t.type === "term" && !t.closed,
      );
      if (remaining.length === 0) void window.api.sshReportStatus(connId, false);
    }
  } else if (!tab.closed) {
    // Still connecting — mark cancelled so addTermTab ignores the eventual resolve,
    // kill the in-progress TCP client, and reset the status immediately.
    tab.cancelled = true;
    void window.api.cancelSshConnect(connId);
    const proto = connections.find((c) => c.id === connId)?.protocol;
    if (proto === "ssh" || proto === "telnet")
      void window.api.sshReportStatus(connId, false);
  }
  if (tab.reconnectTimer !== null) clearTimeout(tab.reconnectTimer);
  tab.term?.dispose();
  state.tabs = state.tabs.filter((t) => t.tabId !== tabId);
  if (state.activeTabId === tabId) {
    state.activeTabId = state.tabs[state.tabs.length - 1]?.tabId ?? null;
  }
  if (state.tabs.length === 0) {
    termState.delete(connId);
    if (IS_TERMINAL_WINDOW) {
      window.close();
      return;
    }
  }
  if (selectedId === connId) {
    if (IS_TERMINAL_WINDOW) {
      const conn = connections.find((c) => c.id === connId);
      if (conn) renderTerminalDetail(conn);
    } else {
      renderDetail();
    }
  }
}

function switchTermTab(connId: string, tabId: string): void {
  const state = termState.get(connId);
  if (!state) return;
  state.activeTabId = tabId;
  if (selectedId === connId) {
    const c = connections.find((c) => c.id === connId);
    if (c) renderTerminalDetail(c);
  }
}

function fitActiveTerminal(connId: string): void {
  const state = termState.get(connId);
  if (!state) return;
  const tab = state.tabs.find((t) => t.tabId === state.activeTabId);
  if (tab?.fitAddon) {
    try {
      tab.fitAddon.fit();
    } catch {}
  }
}

function closeAllTermTabs(connId: string): void {
  const state = termState.get(connId);
  if (!state) return;
  let hasPending = false;
  for (const tab of state.tabs) {
    if (tab.sessionId) {
      const sid = tab.sessionId;
      sidToTab.delete(sid);
      const isTelnetSid = telnetSids.has(sid);
      telnetSids.delete(sid);
      void (isTelnetSid
        ? window.api.telnetCloseSession(sid)
        : window.api.sshCloseSession(sid));
    } else if (!tab.closed) {
      tab.cancelled = true;
      hasPending = true;
    }
    tab.term?.dispose();
  }
  if (hasPending) void window.api.cancelSshConnect(connId);
  termState.delete(connId);
}

function setSftpStatus(connId: string, tab: TermTab, msg: string, ms = 3000) {
  if (tab.sftpStatusTimer !== null) clearTimeout(tab.sftpStatusTimer);
  tab.sftpStatus = msg;
  if (selectedId === connId) {
    const c = connections.find((c) => c.id === connId);
    if (c) renderTerminalDetail(c);
  }
  tab.sftpStatusTimer = setTimeout(() => {
    tab.sftpStatus = null;
    tab.sftpStatusTimer = null;
    if (selectedId === connId) {
      const c = connections.find((c) => c.id === connId);
      if (c) renderTerminalDetail(c);
    }
  }, ms);
}

async function sftpNavigate(
  connId: string,
  tabId: string,
  newPath: string,
): Promise<void> {
  const state = termState.get(connId);
  if (!state) return;
  const tab = state.tabs.find((t) => t.tabId === tabId);
  if (!tab || !tab.sessionId || tab.type !== "sftp") return;
  tab.sftpLoading = true;
  tab.error = null;
  if (selectedId === connId) {
    const c = connections.find((c) => c.id === connId);
    if (c) renderTerminalDetail(c);
  }
  try {
    const entries = await window.api.sftpList(tab.sessionId, newPath);
    tab.sftpPath = newPath;
    tab.sftpEntries = entries;
    tab.sftpSelected = null;
  } catch (e) {
    tab.error = e instanceof Error ? e.message : String(e);
  }
  tab.sftpLoading = false;
  if (selectedId === connId) {
    const c = connections.find((c) => c.id === connId);
    if (c) renderTerminalDetail(c);
  }
}

function renderSftpPanel(connId: string, tab: TermTab): HTMLElement {
  const root = document.createElement("div");
  root.className = "sftp-view";

  // ── Loading / error / closed states ────────────────────────────────────────
  if (tab.sftpLoading) {
    root.innerHTML = `<div class="sftp-state-fill"><div class="sftp-spinner"></div><span>Connecting…</span></div>`;
    return root;
  }
  if (tab.closed && !tab.error) {
    root.innerHTML = `<div class="sftp-state-fill sftp-state-closed">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg>
      <span>Session closed.</span>
    </div>`;
    return root;
  }
  if (tab.error) {
    root.innerHTML = `<div class="sftp-state-fill sftp-state-error">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>${escapeHtml(tab.error)}</span>
    </div>`;
    return root;
  }

  // ── Build visible entries list ──────────────────────────────────────────────
  const allEntries = tab.sftpEntries;
  const hiddenCount = allEntries.filter((e) => e.name.startsWith(".")).length;
  const visible = tab.sftpShowHidden
    ? allEntries
    : allEntries.filter((e) => !e.name.startsWith("."));

  const selectedEntry = visible.find((e) => e.name === tab.sftpSelected) ?? null;

  // ── Toolbar ─────────────────────────────────────────────────────────────────
  const toolbar = document.createElement("div");
  toolbar.className = "sftp-toolbar";

  // Up button
  const upBtn = document.createElement("button");
  upBtn.className = "sftp-icon-btn";
  upBtn.title = "Go up";
  upBtn.disabled = tab.sftpPath === "/";
  upBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;

  // Breadcrumb or path edit input
  let breadcrumbOrInput: HTMLElement;
  if (tab.sftpEditingPath) {
    const wrap = document.createElement("div");
    wrap.className = "sftp-path-edit-wrap";
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "sftp-path-input";
    pathInput.value = tab.sftpPath;
    pathInput.spellcheck = false;
    pathInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const dest = pathInput.value.trim() || "/";
        tab.sftpEditingPath = false;
        void sftpNavigate(connId, tab.tabId, dest);
      } else if (e.key === "Escape") {
        tab.sftpEditingPath = false;
        if (selectedId === connId) {
          const c = connections.find((c) => c.id === connId);
          if (c) renderTerminalDetail(c);
        }
      }
    });
    pathInput.addEventListener("blur", () => {
      if (tab.sftpEditingPath) {
        tab.sftpEditingPath = false;
        if (selectedId === connId) {
          const c = connections.find((c) => c.id === connId);
          if (c) renderTerminalDetail(c);
        }
      }
    });
    wrap.appendChild(pathInput);
    requestAnimationFrame(() => {
      pathInput.focus();
      pathInput.select();
    });
    breadcrumbOrInput = wrap;
  } else {
    const breadcrumb = document.createElement("div");
    breadcrumb.className = "sftp-breadcrumb";
    const pathParts = tab.sftpPath.split("/").filter(Boolean);
    const crumbData: Array<{ label: string; path: string }> = [
      { label: "/", path: "/" },
      ...pathParts.map((part, i) => ({
        label: part,
        path: "/" + pathParts.slice(0, i + 1).join("/"),
      })),
    ];
    crumbData.forEach((crumb, i) => {
      const btn = document.createElement("button");
      btn.className = "sftp-crumb-btn";
      btn.textContent = crumb.label;
      btn.dataset.path = crumb.path;
      if (i === crumbData.length - 1) btn.classList.add("active");
      breadcrumb.appendChild(btn);
      if (i < crumbData.length - 1) {
        const sep = document.createElement("span");
        sep.className = "sftp-crumb-sep";
        sep.textContent = "/";
        breadcrumb.appendChild(sep);
      }
    });
    breadcrumbOrInput = breadcrumb;
  }

  // Hidden toggle
  const hiddenBtn = document.createElement("button");
  hiddenBtn.className = `sftp-icon-btn${tab.sftpShowHidden ? " active" : ""}`;
  hiddenBtn.title = tab.sftpShowHidden ? "Hide hidden files" : "Show hidden files";
  hiddenBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>${tab.sftpShowHidden ? "" : '<line x1="3" y1="21" x2="21" y2="3"/>'}</svg>`;

  // Upload button
  const uploadBtn = document.createElement("button");
  uploadBtn.className = "sftp-action-btn";
  uploadBtn.title = "Upload file";
  uploadBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Upload`;

  // Download button
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "sftp-action-btn";
  downloadBtn.disabled = !selectedEntry || selectedEntry.isDir;
  downloadBtn.title =
    selectedEntry && !selectedEntry.isDir
      ? `Download ${selectedEntry.name}`
      : "Select a file to download";
  downloadBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg> Download`;

  // Refresh button
  const refreshBtn = document.createElement("button");
  refreshBtn.className = "sftp-icon-btn";
  refreshBtn.title = "Refresh";
  refreshBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 11-2.1-7.4L23 10"/></svg>`;

  // New Folder button
  const newFolderBtn = document.createElement("button");
  newFolderBtn.className = "sftp-action-btn";
  newFolderBtn.title = "New folder";
  newFolderBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg> New Folder`;

  const editPathBtn = document.createElement("button");
  editPathBtn.className = "sftp-icon-btn";
  editPathBtn.title = "Go to path…";
  editPathBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>`;
  editPathBtn.addEventListener("click", () => {
    tab.sftpEditingPath = true;
    if (selectedId === connId) {
      const c = connections.find((c) => c.id === connId);
      if (c) renderTerminalDetail(c);
    }
  });

  toolbar.append(
    upBtn,
    breadcrumbOrInput,
    editPathBtn,
    hiddenBtn,
    newFolderBtn,
    uploadBtn,
    downloadBtn,
    refreshBtn,
  );

  // ── Column headers ───────────────────────────────────────────────────────────
  const colHeader = document.createElement("div");
  colHeader.className = "sftp-col-header";
  colHeader.innerHTML = `<span class="sftp-col-name">Name</span><span class="sftp-col-size">Size</span><span class="sftp-col-mtime">Modified</span>`;

  // ── Multi-select action bar ──────────────────────────────────────────────────
  const multiCount = tab.multiSelected.size;
  if (multiCount > 0) {
    const multiBar = document.createElement("div");
    multiBar.className = "sftp-multi-bar";
    multiBar.innerHTML = `<span>${multiCount} selected</span>`;
    const clearBtn = document.createElement("button");
    clearBtn.className = "sftp-action-btn";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => {
      tab.multiSelected.clear();
      if (selectedId === connId) {
        const c = connections.find((c) => c.id === connId);
        if (c) renderTerminalDetail(c);
      }
    });
    const delBtn = document.createElement("button");
    delBtn.className = "sftp-action-btn";
    delBtn.textContent = `Delete ${multiCount}`;
    delBtn.style.color = "var(--error)";
    delBtn.addEventListener("click", async () => {
      if (!tab.sessionId) return;
      const items = [...tab.multiSelected];
      for (const name of items) {
        const entry = tab.sftpEntries.find((e) => e.name === name);
        if (!entry) continue;
        try {
          await window.api.sftpDelete(
            tab.sessionId,
            sftpJoin(tab.sftpPath, name),
            entry.isDir,
          );
        } catch {}
      }
      tab.multiSelected.clear();
      void sftpNavigate(connId, tab.tabId, tab.sftpPath);
      setSftpStatus(
        connId,
        tab,
        `${items.length} item${items.length !== 1 ? "s" : ""} deleted.`,
      );
    });
    multiBar.append(clearBtn, delBtn);
    root.appendChild(toolbar);
    root.appendChild(multiBar);
  } else {
    root.appendChild(toolbar);
  }

  // ── File list ────────────────────────────────────────────────────────────────
  const list = document.createElement("div");
  list.className = "sftp-list";

  // Parent ".." row (not shown at root)
  if (tab.sftpPath !== "/") {
    const parentRow = document.createElement("div");
    parentRow.className = "sftp-row sftp-row-parent";
    parentRow.dataset.name = "..";
    parentRow.dataset.isdir = "true";
    parentRow.innerHTML = `
      <span class="sftp-row-icon">${SFTP_ICON_SVG.folder}</span>
      <span class="sftp-row-name sftp-row-name--dir">..</span>
      <span class="sftp-row-size"></span>
      <span class="sftp-row-mtime"></span>`;
    list.appendChild(parentRow);
  }

  if (visible.length === 0 && tab.sftpPath === "/") {
    const empty = document.createElement("div");
    empty.className = "sftp-state-fill";
    empty.innerHTML = `<span style="color:var(--text-muted)">Empty directory</span>`;
    list.appendChild(empty);
  }

  for (const entry of visible) {
    const kind = sftpIconKind(entry);
    const isSelected = tab.sftpSelected === entry.name;
    const isMultiSelected = tab.multiSelected.has(entry.name);
    const isHidden = entry.name.startsWith(".");
    const row = document.createElement("div");
    row.className =
      `sftp-row` +
      (entry.isDir ? " sftp-row--dir" : "") +
      (entry.isSymlink ? " sftp-row--symlink" : "") +
      (isSelected ? " sftp-row--selected" : "") +
      (isMultiSelected ? " sftp-row--multi-selected" : "") +
      (isHidden ? " sftp-row--hidden" : "");
    row.dataset.name = entry.name;
    row.dataset.isdir = String(entry.isDir);
    row.innerHTML = `
      <span class="sftp-row-icon">${SFTP_ICON_SVG[kind]}</span>
      <span class="sftp-row-name${entry.isDir ? " sftp-row-name--dir" : ""}${entry.isSymlink ? " sftp-row-name--symlink" : ""}">${escapeHtml(entry.name)}${entry.isSymlink ? '<span class="sftp-symlink-arrow">→</span>' : ""}</span>
      <span class="sftp-row-size">${entry.isDir ? "" : formatBytes(entry.size)}</span>
      <span class="sftp-row-mtime">${formatMtime(entry.mtime)}</span>`;
    list.appendChild(row);
  }

  // ── Status bar ───────────────────────────────────────────────────────────────
  const statusBar = document.createElement("div");
  statusBar.className = "sftp-status-bar";
  const itemLabel = `${visible.length} item${visible.length !== 1 ? "s" : ""}`;
  const hiddenLabel =
    !tab.sftpShowHidden && hiddenCount > 0 ? `  ·  ${hiddenCount} hidden` : "";
  const selLabel = selectedEntry
    ? `  ·  ${escapeHtml(selectedEntry.name)}${selectedEntry.isDir ? "/" : "  " + formatBytes(selectedEntry.size)}`
    : "";
  const opStatus = tab.sftpStatus
    ? `<span style="margin-left:auto;color:var(--connected);font-size:11px;">${escapeHtml(tab.sftpStatus)}</span>`
    : "";
  statusBar.innerHTML = `<span>${itemLabel}${hiddenLabel}${selLabel}</span>${opStatus}`;

  // Drag-and-drop upload: drop local files onto the SFTP panel.
  root.addEventListener("dragover", (e) => {
    if (!tab.sessionId || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    root.style.outline = "2px solid var(--connecting)";
    root.style.outlineOffset = "-2px";
  });
  root.addEventListener("dragleave", () => {
    root.style.outline = "";
    root.style.outlineOffset = "";
  });
  root.addEventListener("drop", async (e) => {
    e.preventDefault();
    root.style.outline = "";
    root.style.outlineOffset = "";
    if (!tab.sessionId) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    let uploaded = 0;
    const errors: string[] = [];
    for (const file of files) {
      const localPath = (file as File & { path?: string }).path;
      if (!localPath) continue;
      const dest = sftpJoin(tab.sftpPath, file.name);
      try {
        await window.api.sftpUploadPath(tab.sessionId, localPath, dest);
        uploaded++;
      } catch (err) {
        errors.push(file.name);
      }
    }
    void sftpNavigate(connId, tab.tabId, tab.sftpPath);
    if (errors.length) {
      showToast(`${uploaded} uploaded, ${errors.length} failed.`, "error");
    } else if (uploaded > 0) {
      setSftpStatus(
        connId,
        tab,
        `${uploaded} file${uploaded !== 1 ? "s" : ""} uploaded.`,
      );
    }
  });

  root.append(colHeader, list, statusBar);

  // ── Event wiring ─────────────────────────────────────────────────────────────
  upBtn.addEventListener("click", () => {
    const parent = tab.sftpPath.split("/").slice(0, -1).join("/") || "/";
    void sftpNavigate(connId, tab.tabId, parent);
  });

  breadcrumbOrInput
    .querySelectorAll<HTMLButtonElement>(".sftp-crumb-btn")
    .forEach((btn) => {
      btn.addEventListener("click", () =>
        sftpNavigate(connId, tab.tabId, btn.dataset.path!),
      );
    });

  hiddenBtn.addEventListener("click", () => {
    tab.sftpShowHidden = !tab.sftpShowHidden;
    tab.sftpSelected = null;
    if (selectedId === connId) {
      const c = connections.find((c) => c.id === connId);
      if (c) renderTerminalDetail(c);
    }
  });

  newFolderBtn.addEventListener("click", async () => {
    if (!tab.sessionId) return;
    const name = await showPrompt("New folder name:", "New Folder");
    if (!name || !tab.sessionId) return;
    try {
      await window.api.sftpMkdir(tab.sessionId, sftpJoin(tab.sftpPath, name));
      void sftpNavigate(connId, tab.tabId, tab.sftpPath);
      setSftpStatus(connId, tab, `Folder "${name}" created.`);
    } catch (e) {
      showToast(
        `Create folder failed: ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    }
  });

  uploadBtn.addEventListener("click", async () => {
    if (!tab.sessionId) return;
    const result = await window.api.sftpUpload(tab.sessionId, tab.sftpPath);
    if (!result.canceled) {
      void sftpNavigate(connId, tab.tabId, tab.sftpPath);
      const fname = result.dest ? (result.dest.split("/").pop() ?? "file") : "file";
      setSftpStatus(connId, tab, `"${fname}" uploaded.`);
    }
  });

  downloadBtn.addEventListener("click", async () => {
    if (!tab.sessionId || !tab.sftpSelected) return;
    const result = await window.api.sftpDownload(
      tab.sessionId,
      sftpJoin(tab.sftpPath, tab.sftpSelected),
    );
    if (!result.canceled && result.filePath) {
      const fname = result.filePath.split(/[\\/]/).pop() ?? "file";
      setSftpStatus(connId, tab, `"${fname}" saved.`);
    }
  });

  refreshBtn.addEventListener("click", () =>
    sftpNavigate(connId, tab.tabId, tab.sftpPath),
  );

  list.querySelectorAll<HTMLElement>(".sftp-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      const name = row.dataset.name!;
      if (name === "..") return;
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+click: toggle multi-select
        if (tab.multiSelected.has(name)) {
          tab.multiSelected.delete(name);
        } else {
          tab.multiSelected.add(name);
        }
        tab.sftpSelected = name;
      } else {
        tab.multiSelected.clear();
        tab.sftpSelected = tab.sftpSelected === name ? null : name;
      }
      if (selectedId === connId) {
        const c = connections.find((c) => c.id === connId);
        if (c) renderTerminalDetail(c);
      }
    });
    row.addEventListener("dblclick", () => {
      const name = row.dataset.name!;
      const isDir = row.dataset.isdir === "true";
      if (isDir) {
        const dest =
          name === ".."
            ? tab.sftpPath.split("/").slice(0, -1).join("/") || "/"
            : sftpJoin(tab.sftpPath, name);
        void sftpNavigate(connId, tab.tabId, dest);
      } else {
        if (!tab.sessionId) return;
        void window.api.sftpDownload(tab.sessionId, sftpJoin(tab.sftpPath, name));
      }
    });
    row.addEventListener("contextmenu", (e) => {
      const name = row.dataset.name!;
      if (name === "..") return;
      e.preventDefault();
      const isDir = row.dataset.isdir === "true";
      const entry = tab.sftpEntries.find((en) => en.name === name);
      if (!entry) return;
      // Select the right-clicked entry
      tab.sftpSelected = name;
      if (selectedId === connId) {
        const c = connections.find((c) => c.id === connId);
        if (c) renderTerminalDetail(c);
      }

      showDropdownMenu(e.clientX, e.clientY, [
        {
          label: "Download",
          disabled: isDir,
          action: () => {
            if (!tab.sessionId) return;
            void window.api.sftpDownload(tab.sessionId, sftpJoin(tab.sftpPath, name));
          },
        },
        {
          label: "Rename",
          action: async () => {
            const newName = await showPrompt("Rename to:", name);
            if (!newName || newName === name || !tab.sessionId) return;
            try {
              await window.api.sftpRename(
                tab.sessionId,
                sftpJoin(tab.sftpPath, name),
                sftpJoin(tab.sftpPath, newName),
              );
              void sftpNavigate(connId, tab.tabId, tab.sftpPath);
              setSftpStatus(connId, tab, `Renamed to "${newName}".`);
            } catch (err) {
              showToast(
                `Rename failed: ${err instanceof Error ? err.message : String(err)}`,
                "error",
              );
            }
          },
        },
        { separator: true },
        {
          label: `Delete "${name}"`,
          action: async () => {
            const ok = await showConfirm(
              `Delete "${name}"?${isDir ? " (directory must be empty)" : ""} This cannot be undone.`,
            );
            if (!ok || !tab.sessionId) return;
            try {
              await window.api.sftpDelete(
                tab.sessionId,
                sftpJoin(tab.sftpPath, name),
                isDir && !entry.isSymlink,
              );
              void sftpNavigate(connId, tab.tabId, tab.sftpPath);
              setSftpStatus(connId, tab, `"${name}" deleted.`);
            } catch (err) {
              showToast(
                `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
                "error",
              );
            }
          },
        },
      ]);
    });
  });

  return root;
}

// ─── OS / distro icon for terminal tabs ──────────────────────────────────────

function getOsIcon(os: string): string {
  const s = (os || "").toLowerCase().replace(/-/g, "");
  // Windows — 4-colour flag
  if (s === "windows" || s === "windowsnt") return `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="0.5" y="0.5" width="5.5" height="5.5" fill="#F25022"/><rect x="8" y="0.5" width="5.5" height="5.5" fill="#7FBA00"/><rect x="0.5" y="8" width="5.5" height="5.5" fill="#00A4EF"/><rect x="8" y="8" width="5.5" height="5.5" fill="#FFB900"/></svg>`;
  // Ubuntu — orange circle, 3 dots
  if (s.startsWith("ubuntu")) return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="#E95420"/><circle cx="7" cy="2.5" r="1.3" fill="white"/><circle cx="10.8" cy="9" r="1.3" fill="white"/><circle cx="3.2" cy="9" r="1.3" fill="white"/></svg>`;
  // Debian — red circle + swirl arc
  if (s === "debian") return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="#A80030"/><path d="M7 3.5a3.5 3.5 0 1 1-3 5.3" stroke="white" fill="none" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="3.5" r="1" fill="white"/></svg>`;
  // Fedora — blue circle + F mark
  if (s === "fedora") return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="#294172"/><path d="M7 10.5V7m0 0V4a2 2 0 0 1 4 0v3H7" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  // Arch Linux — upward triangle with cutout
  if (s === "arch" || s === "archlinux") return `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5L13 12.5H1Z" fill="#1793D1"/><path d="M7 5.5L9 10H5Z" fill="#111"/></svg>`;
  // Alpine — mountain peak
  if (s === "alpine") return `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5L13 12.5H1Z" fill="#0D597F"/><path d="M5.5 12.5L7 8.5L8.5 12.5Z" fill="white"/></svg>`;
  // CentOS / Rocky / AlmaLinux — diamond
  if (s === "centos" || s === "rocky" || s === "almalinux" || s === "rhel") return `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5L12.5 7L7 12.5L1.5 7Z" fill="#932279"/><path d="M7 4.5L9.5 7L7 9.5L4.5 7Z" fill="white"/></svg>`;
  // Kali Linux — K on blue
  if (s === "kali" || s === "kalirolling") return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="#268BEE"/><path d="M5 3.5V10.5M5 7L8.5 3.5M5 7L8.5 10.5" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  // Raspberry Pi / Raspbian
  if (s === "raspbian" || s === "raspios") return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="#BC1142"/><circle cx="7" cy="7" r="2" fill="white"/><circle cx="7" cy="2.8" r="0.9" fill="white"/><circle cx="7" cy="11.2" r="0.9" fill="white"/><circle cx="3" cy="5.4" r="0.9" fill="white"/><circle cx="11" cy="5.4" r="0.9" fill="white"/><circle cx="3" cy="8.6" r="0.9" fill="white"/><circle cx="11" cy="8.6" r="0.9" fill="white"/></svg>`;
  // openSUSE
  if (s.startsWith("opensuse") || s === "sles") return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="#73BA25"/><path d="M4.5 9.5a3.5 3.5 0 1 1 5 0" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
  // Linux Mint
  if (s === "linuxmint") return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="#87CF3E"/><rect x="4" y="4" width="6" height="6" rx="1" fill="#3C6E47"/></svg>`;
  // macOS / Darwin
  if (s === "darwin" || s === "macos") return `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M10 4.5C9 3 7.5 2.5 6.5 2.5C5.5 2.5 4 3 3 4.5C2 6 2 8 3 9.5C3.5 10.5 4.5 11.5 6.5 11.5C8.5 11.5 9.5 10.5 10 9.5C11 8 11 6 10 4.5Z" fill="#aaa"/><path d="M7 1.5C7.5 1.5 8 2 8.5 2" stroke="#aaa" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>`;
  // Telnet — wave lines
  if (s === "telnet") return `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 5c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M2 9c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;
  // Default / generic Linux — terminal prompt
  return `<svg width="14" height="14" viewBox="0 0 14 14"><polyline points="2,4.5 5.5,7 2,9.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><line x1="7" y1="9.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

function renderTerminalDetail(conn: Connection): void {
  const state = termState.get(conn.id);

  if (!state || state.tabs.length === 0) {
    detailPanel.innerHTML = `<div class="detail-empty"><div class="detail-empty-sub">Opening terminal…</div></div>`;
    return;
  }

  // Clear the panel (terminal .el divs are kept alive in memory and re-appended).
  detailPanel.innerHTML = "";

  const view = document.createElement("div");
  view.className = "terminal-view";

  // Tab bar
  const tabBar = document.createElement("div");
  tabBar.className = "term-tab-bar";

  const osIcon = getOsIcon(state.osInfo);

  for (const tab of state.tabs) {
    const tabEl = document.createElement("div");
    tabEl.className = `term-tab${tab.tabId === state.activeTabId ? " active" : ""}`;
    tabEl.innerHTML = `<span class="term-tab-icon">${osIcon}</span><span class="term-tab-label">${escapeHtml(tab.label)}</span><button class="term-tab-close" title="Close tab">×</button>`;
    tabEl.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("term-tab-close")) {
        closeTermTab(conn.id, tab.tabId);
      } else {
        switchTermTab(conn.id, tab.tabId);
      }
    });
    // Double-click label to rename tab
    const labelEl = tabEl.querySelector<HTMLElement>(".term-tab-label")!;
    labelEl.addEventListener("dblclick", async (e) => {
      e.stopPropagation();
      const newName = await showPrompt("Rename tab:", tab.label);
      if (newName && newName !== tab.label) {
        tab.label = newName;
        const c = connections.find((c) => c.id === conn.id);
        if (c) renderTerminalDetail(c);
      }
    });
    tabBar.appendChild(tabEl);
  }

  const newBtn = document.createElement("button");
  newBtn.className = "term-new-btn";
  newBtn.title = "New tab";
  newBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  // New-tab dropdown: Terminal or File Transfer
  newBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.createElement("div");
    menu.style.cssText =
      "position:fixed;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-sm);z-index:9999;min-width:160px;padding:4px 0;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.4)";
    const rect = newBtn.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;

    const item = (label: string, action: () => void) => {
      const el = document.createElement("div");
      el.style.cssText = "padding:7px 14px;cursor:pointer;";
      el.textContent = label;
      el.addEventListener("mouseenter", () => {
        el.style.background = "var(--bg-hover)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.background = "";
      });
      el.addEventListener("click", () => {
        document.body.removeChild(menu);
        action();
      });
      menu.appendChild(el);
    };

    item("Terminal", () => void addTermTab(conn.id, "term"));
    if (conn.protocol === "ssh" || conn.protocol === "ssh-cf") {
      item("File Transfer (SFTP)", () => void addTermTab(conn.id, "sftp"));
    }

    document.body.appendChild(menu);
    const dismiss = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        if (document.body.contains(menu)) document.body.removeChild(menu);
        document.removeEventListener("click", dismiss);
      }
    };
    setTimeout(() => {
      if (document.body.contains(menu)) document.addEventListener("click", dismiss);
    }, 0);
  });

  tabBar.appendChild(newBtn);
  tabBar.appendChild(
    Object.assign(document.createElement("div"), { className: "term-bar-spacer" }),
  );

  const barActions = document.createElement("div");
  barActions.className = "term-bar-actions";

  if (!IS_TERMINAL_WINDOW) {
    const svgStop = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>`;
    const disconnectBtn = document.createElement("button");
    disconnectBtn.className = "cmd-btn";
    disconnectBtn.innerHTML = `${svgStop} Disconnect`;
    disconnectBtn.addEventListener("click", () => handleAction("disconnect", conn.id));
    barActions.appendChild(disconnectBtn);
  }
  tabBar.appendChild(barActions);

  view.appendChild(tabBar);

  // Search bar — shown when active tab has searchVisible=true
  const activeTab = state.tabs.find((t) => t.tabId === state.activeTabId);
  if (activeTab?.type === "term" && activeTab.searchVisible) {
    const searchBar = document.createElement("div");
    searchBar.className = "term-search-bar";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "term-search-input";
    searchInput.placeholder = "Search terminal…";
    const countEl = document.createElement("span");
    countEl.className = "term-search-count";
    const prevBtn = document.createElement("button");
    prevBtn.className = "term-search-btn";
    prevBtn.textContent = "↑";
    prevBtn.title = "Previous";
    const nextBtn = document.createElement("button");
    nextBtn.className = "term-search-btn";
    nextBtn.textContent = "↓";
    nextBtn.title = "Next";
    const closeBtn = document.createElement("button");
    closeBtn.className = "term-search-btn";
    closeBtn.textContent = "✕";
    closeBtn.title = "Close search";
    searchBar.append(searchInput, countEl, prevBtn, nextBtn, closeBtn);
    view.appendChild(searchBar);
    const doSearch = (dir: "next" | "prev") => {
      const q = searchInput.value;
      if (!q || !activeTab.searchAddon) return;
      if (dir === "next") activeTab.searchAddon.findNext(q);
      else activeTab.searchAddon.findPrevious(q);
    };
    searchInput.addEventListener("input", () => doSearch("next"));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch(e.shiftKey ? "prev" : "next");
      if (e.key === "Escape") {
        activeTab.searchVisible = false;
        activeTab.searchAddon?.clearDecorations();
        const c = connections.find((c) => c.id === conn.id);
        if (c) renderTerminalDetail(c);
      }
    });
    prevBtn.addEventListener("click", () => doSearch("prev"));
    nextBtn.addEventListener("click", () => doSearch("next"));
    closeBtn.addEventListener("click", () => {
      activeTab.searchVisible = false;
      activeTab.searchAddon?.clearDecorations();
      const c = connections.find((c) => c.id === conn.id);
      if (c) renderTerminalDetail(c);
    });
    requestAnimationFrame(() => searchInput.focus());
  }

  // Panel area — re-attach persistent terminal divs, build sftp panels inline
  const panelsEl = document.createElement("div");
  panelsEl.className = "term-panels";

  for (const tab of state.tabs) {
    if (tab.type === "term") {
      tab.el.classList.toggle("active", tab.tabId === state.activeTabId);
      if (tab.closed || tab.error) {
        const msgDiv = document.createElement("div");
        msgDiv.className = tab.error ? "term-tab-error" : "term-tab-closed";
        msgDiv.textContent = tab.error ?? "Connection closed.";
        if (!tab.error) {
          const reconnBtn = document.createElement("button");
          reconnBtn.className = "btn btn-secondary btn-sm";
          reconnBtn.style.cssText = "display:block;margin-top:14px;";
          reconnBtn.textContent = "Reconnect";
          reconnBtn.addEventListener("click", () => {
            closeTermTab(conn.id, tab.tabId);
            void addTermTab(conn.id, "term");
          });
          msgDiv.appendChild(reconnBtn);
        }
        tab.el.innerHTML = "";
        tab.el.appendChild(msgDiv);
      }
      panelsEl.appendChild(tab.el);
    } else {
      const sftpWrapper = document.createElement("div");
      sftpWrapper.className = "term-panel";
      sftpWrapper.classList.toggle("active", tab.tabId === state.activeTabId);
      sftpWrapper.appendChild(renderSftpPanel(conn.id, tab));
      panelsEl.appendChild(sftpWrapper);
    }
  }

  view.appendChild(panelsEl);
  detailPanel.appendChild(view);

  // Fit active terminal after layout settles
  requestAnimationFrame(() => fitActiveTerminal(conn.id));
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function makeSidebarItem(conn: Connection, pinnedIds: Set<string>): HTMLElement {
  const status = getStatus(conn.id);
  const isPinned = pinnedIds.has(conn.id);
  const item = document.createElement("div");
  item.className = `tunnel-item ${status}${selectedId === conn.id && !settingsView ? " active" : ""}${isPinned ? " pinned" : ""}`;
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
    <button class="pin-btn" title="${isPinned ? "Unpin" : "Pin"}">${isPinned ? "★" : "☆"}</button>
  `;
  item.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).classList.contains("pin-btn")) return;
    if (selectedId !== conn.id || settingsView) {
      debugMode = false;
      stopDebugPoll();
    }
    settingsView = false;
    selectedId = conn.id;
    renderSidebar();
    renderDetail();
  });
  const pinBtn = item.querySelector<HTMLButtonElement>(".pin-btn")!;
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void togglePin(conn.id);
  });
  makeSidebarItemDraggable(item, conn.id);

  item.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showDropdownMenu(e.clientX, e.clientY, [
      {
        label: isPinned ? "Unpin" : "Pin to top",
        action: () => void togglePin(conn.id),
      },
      { separator: true },
      { label: "Edit", action: () => window.api.openFormWindow(conn.id) },
      {
        label: "Duplicate",
        action: () => void handleAction("duplicate", conn.id),
      },
      { separator: true },
      {
        label: "Delete",
        action: () => void handleAction("delete", conn.id),
      },
    ]);
  });
  return item;
}

async function togglePin(connId: string): Promise<void> {
  if (!currentSettings) return;
  const current = currentSettings.pinnedIds ?? [];
  const next = current.includes(connId)
    ? current.filter((x) => x !== connId)
    : [...current, connId];
  try {
    currentSettings = await window.api.saveSettings({ pinnedIds: next });
    renderSidebar();
  } catch {
    showToast("Could not update pin.", "error");
  }
}

function renderSidebar() {
  sidebarList.innerHTML = "";

  const pinnedIds = new Set(currentSettings?.pinnedIds ?? []);

  // Temp connections don't appear in the sidebar (they're quick-connect sessions)
  const visibleConns = connections.filter((c) => !c.temp);

  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? visibleConns.filter(
        (c) =>
          (c.friendlyName || "").toLowerCase().includes(query) ||
          c.hostname.toLowerCase().includes(query) ||
          (c.group || "").toLowerCase().includes(query),
      )
    : visibleConns;

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

  // Pinned connections first, then grouped.
  const pinned = filtered.filter((c) => pinnedIds.has(c.id));
  const unpinned = filtered.filter((c) => !pinnedIds.has(c.id));

  if (pinned.length > 0) {
    const hdr = document.createElement("div");
    hdr.className = "sidebar-section-label";
    hdr.textContent = "Pinned";
    sidebarList.appendChild(hdr);
    for (const conn of pinned) sidebarList.appendChild(makeSidebarItem(conn, pinnedIds));
    if (unpinned.length > 0) {
      const hdr2 = document.createElement("div");
      hdr2.className = "sidebar-section-label";
      hdr2.textContent = "All Tunnels";
      sidebarList.appendChild(hdr2);
    }
  }

  // Group connections (unpinned only).
  const groups: Map<string, Connection[]> = new Map();
  for (const conn of unpinned) {
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
      sidebarList.appendChild(makeSidebarItem(conn, pinnedIds));
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
  const authUrl = isConnecting ? authPendingUrls.get(conn.id) : undefined;

  const svgPlay = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const svgStop = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>`;
  const svgRefresh = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
  const svgEdit = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const svgTrash = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  const svgActivity = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;

  const isSshOrTelnet = proto === "ssh-cf" || proto === "ssh" || proto === "telnet";
  const relaunchLabel = "Open Terminal";

  let connectActions = "";
  if (!isConnected && !isConnecting) {
    connectActions = `<button class="cmd-btn cmd-primary" data-action="connect" data-id="${conn.id}">${svgPlay} ${escapeHtml(connectLabel(proto))}</button>`;
  } else if (isConnected) {
    if (rdpClosed.has(conn.id) && isRdpCf) {
      connectActions = `<button class="cmd-btn cmd-primary" data-action="reconnect-rdp" data-id="${conn.id}">${svgRefresh} Reconnect RDP</button>`;
    }
    if (isSshOrTelnet) {
      connectActions += `<button class="cmd-btn" data-action="relaunch-client" data-id="${conn.id}">${svgRefresh} ${escapeHtml(relaunchLabel)}</button>`;
    }
    connectActions += `<button class="cmd-btn" data-action="disconnect" data-id="${conn.id}">${svgStop} Disconnect</button>`;
  } else {
    connectActions = `<button class="cmd-btn" disabled><span class="spinner"></span> Connecting&hellip;</button><button class="cmd-btn cmd-danger" data-action="disconnect" data-id="${conn.id}">${svgStop} Cancel</button>`;
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

  const uptimeMs = isConnected ? sessionConnectedAt.get(conn.id) : undefined;
  const uptimeChip = uptimeMs
    ? `<span class="uptime-chip" id="uptime-chip-${conn.id}">${formatUptime(Math.floor((Date.now() - uptimeMs) / 1000))}</span>`
    : "";

  const isHttpProto = proto === "http" || proto === "https";
  const httpTestBtn = isHttpProto
    ? `<button class="cmd-btn" data-action="test-http" data-id="${conn.id}">⚡ Test</button>`
    : "";

  const jumpRow = conn.jumpHost
    ? `<div class="prop-row"><span class="prop-label">Jump Host</span><span class="prop-value mono">${escapeHtml(conn.jumpHost)}:${conn.jumpPort ?? 22}</span></div>`
    : "";

  detailPanel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title-row">
        <h1 class="detail-title">${escapeHtml(conn.friendlyName || conn.hostname)}</h1>
        <span class="detail-status-pill ${rdpIsDown ? "rdp-disconnected" : status}">
          <span class="status-dot"></span>
          ${rdpIsDown ? "RDP Disconnected" : statusLabel(status)}
        </span>
        ${uptimeChip}
      </div>
      ${conn.friendlyName ? `<div class="detail-subtitle">${escapeHtml(conn.hostname)}</div>` : ""}
    </div>

    <div class="command-bar">
      ${connectActions}
      ${httpTestBtn}
      <button class="cmd-btn" data-action="edit" data-id="${conn.id}">${svgEdit} Edit</button>
      <button class="cmd-btn" data-action="duplicate" data-id="${conn.id}">⧉ Duplicate</button>
      <div class="cmd-separator"></div>
      <button class="cmd-btn cmd-danger" data-action="delete" data-id="${conn.id}">${svgTrash} Delete</button>
      <div class="cmd-separator"></div>
      <button class="cmd-btn cmd-debug${debugMode ? " active" : ""}" data-action="toggle-debug" data-id="${conn.id}">${svgActivity} Debug</button>
    </div>

    ${isHttpProto ? `<div id="http-test-result-${conn.id}" class="http-test-result" style="padding:0 16px 8px"></div>` : ""}

    ${
      authUrl
        ? `<div class="auth-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span class="auth-banner-text">Cloudflare Access login required — sign in via your browser to continue.</span>
        <button class="cmd-btn" data-action="open-auth-url" data-id="${conn.id}" data-value="${escapeHtml(authUrl)}">Open Browser</button>
      </div>`
        : ""
    }

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
      ${jumpRow}
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
            <span class="settings-label">Theme</span>
          </div>
          <select class="form-input settings-select" id="s-theme">
            <option value="dark" ${(s.theme ?? "dark") === "dark" ? "selected" : ""}>Dark (default)</option>
            <option value="light" ${s.theme === "light" ? "selected" : ""}>Light</option>
            <option value="system" ${s.theme === "system" ? "selected" : ""}>System</option>
          </select>
        </div>
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
            <span class="settings-label">Auto-reconnect terminal</span>
            <span class="settings-desc">Automatically retry when an SSH or Telnet session drops unexpectedly (up to 3 attempts).</span>
          </div>
          <label class="toggle">
            <input type="checkbox" id="s-auto-reconnect" ${(s.autoReconnect ?? true) ? "checked" : ""}>
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
            <input class="form-input" type="text" id="s-cf-path" placeholder="${window.api.platform === "win32" ? "e.g. C:\\tools\\cloudflared.exe" : "e.g. /usr/local/bin/cloudflared"}" value="${escapeHtml(s.cloudflaredPath)}" autocomplete="off" />
            <button type="button" class="btn btn-secondary btn-sm" id="s-cf-browse">Browse</button>
            <button type="button" class="btn btn-ghost btn-sm" id="s-cf-clear" title="Reset to PATH">&times;</button>
          </div>
        </div>
        <div class="settings-row settings-row--col">
          <div class="settings-row-label">
            <span class="settings-label">Default SFTP download folder</span>
            <span class="settings-desc">Pre-fills the save dialog when downloading files via SFTP. Leave empty to use the system default.</span>
          </div>
          <div class="form-file-row" style="margin-top:8px">
            <input class="form-input" type="text" id="s-sftp-dl" placeholder="e.g. ${window.api.platform === "win32" ? "C:\\Users\\You\\Downloads" : "~/Downloads"}" value="${escapeHtml(s.sftpDownloadFolder)}" autocomplete="off" />
            <button type="button" class="btn btn-secondary btn-sm" id="s-sftp-dl-browse">Browse</button>
            <button type="button" class="btn btn-ghost btn-sm" id="s-sftp-dl-clear" title="Clear">&times;</button>
          </div>
        </div>
      </div>

      <div class="prop-section-label" style="margin-top:22px">Backup</div>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Export connections</span>
            <span class="settings-desc">Save all tunnels to a JSON file (passwords not included).</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-export">Export…</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Import connections</span>
            <span class="settings-desc">Load tunnels from a previously exported JSON file.</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-import">Import…</button>
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
    const isWin = window.api.platform === "win32";
    const filters = isWin
      ? [
          { name: "Executable", extensions: ["exe"] },
          { name: "All Files", extensions: ["*"] },
        ]
      : [{ name: "All Files", extensions: ["*"] }];
    const picked = await window.api.pickFile({
      title: "Select cloudflared executable",
      filters,
    });
    if (picked) cfPathInput.value = picked;
  });
  document.getElementById("s-cf-clear")!.addEventListener("click", () => {
    cfPathInput.value = "";
  });

  document.getElementById("s-open-log")!.addEventListener("click", async () => {
    await window.api.openLogFolder();
  });

  const sftpDlInput = document.getElementById("s-sftp-dl") as HTMLInputElement;
  document.getElementById("s-sftp-dl-browse")!.addEventListener("click", async () => {
    const picked = await window.api.pickFile({ title: "Select default download folder" });
    if (picked) {
      // Use the folder containing the picked file as the download folder.
      const parts = picked.replace(/\\/g, "/").split("/");
      parts.pop();
      sftpDlInput.value = parts.join("/") || picked;
    }
  });
  document.getElementById("s-sftp-dl-clear")!.addEventListener("click", () => {
    sftpDlInput.value = "";
  });

  document.getElementById("s-export")!.addEventListener("click", async () => {
    try {
      const res = await window.api.exportConnections();
      if (!res.canceled)
        showToast(
          `Exported ${res.count} tunnel${res.count !== 1 ? "s" : ""}.`,
          "success",
        );
    } catch (err) {
      showToast(errorMsg(err, "Export failed."), "error");
    }
  });

  document.getElementById("s-import")!.addEventListener("click", async () => {
    try {
      const res = await window.api.importConnections();
      if (!res.canceled) {
        showToast(
          `Imported ${res.added} tunnel${res.added !== 1 ? "s" : ""}.`,
          "success",
        );
        await refreshConnections();
      }
    } catch (err) {
      showToast(errorMsg(err, "Import failed."), "error");
    }
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
    const sftpDl =
      (document.getElementById("s-sftp-dl") as HTMLInputElement)?.value.trim() ?? "";
    const theme =
      ((document.getElementById("s-theme") as HTMLSelectElement)?.value as
        | "dark"
        | "light"
        | "system") ?? "dark";
    const autoReconnect =
      (document.getElementById("s-auto-reconnect") as HTMLInputElement)?.checked ?? true;
    try {
      currentSettings = await window.api.saveSettings({
        minimizeToTray: minTray,
        startMinimized: startMin,
        defaultProtocol: defProto,
        cloudflaredPath: cfPath,
        logRetentionDays: logDays,
        sftpDownloadFolder: sftpDl,
        theme,
        autoReconnect,
      });
      applyTheme(theme);
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
      if (proto === "ssh" || proto === "ssh-cf" || proto === "telnet") {
        appendLog(`Opening terminal — ${connName(id)}`);
        showToast("Opening terminal…", "info");
        void window.api.openTermWindow(id, connName(id));
      } else {
        const successMsg =
          proto === "http" || proto === "https"
            ? "Opened in browser."
            : "Connected — client launched.";
        appendLog(`${label} launched — ${connName(id)}`);
        showToast(successMsg, "success");
      }
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
    window.api.openFormWindow(id);
  } else if (action === "delete") {
    const conn = connections.find((c) => c.id === id);
    const label = conn ? conn.friendlyName || conn.hostname : "this tunnel";
    if (!(await showConfirm(`Delete "${label}"? This cannot be undone.`))) return;
    try {
      const name = connName(id);
      connections = await window.api.deleteConnection(id);
      authPendingUrls.delete(id);
      rdpClosed.delete(id);
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
  } else if (action === "duplicate") {
    const conn = connections.find((c) => c.id === id);
    if (!conn) return;
    try {
      await window.api.saveConnection({
        friendlyName: `${conn.friendlyName || conn.hostname} (copy)`,
        hostname: conn.hostname,
        port: conn.port,
        protocol: conn.protocol,
        username: conn.username,
        notes: conn.notes,
        group: conn.group,
        sshKeyPath: conn.sshKeyPath,
      });
      connections = await window.api.loadConnections();
      renderSidebar();
      showToast("Tunnel duplicated.", "success");
    } catch (err) {
      showToast(errorMsg(err, "Duplicate failed."), "error");
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
  } else if (action === "relaunch-client") {
    appendLog(`Open terminal — ${connName(id)}`);
    void window.api.openTermWindow(id, connName(id));
  } else if (action === "toggle-debug") {
    debugMode = !debugMode;
    renderDetail();
  } else if (action === "copy-endpoint") {
    const conn = connections.find((c) => c.id === id);
    if (!conn) return;
    const endpoint = value || localEndpoint(conn);
    try {
      await navigator.clipboard.writeText(endpoint);
      showToast(`Copied ${endpoint}`, "success");
    } catch {
      showToast("Failed to copy.", "error");
    }
  } else if (action === "test-http") {
    const conn = connections.find((c) => c.id === id);
    if (!conn) return;
    const url = `${conn.protocol}://${conn.hostname}:${conn.port}`;
    const resultEl = document.getElementById(`http-test-result-${id}`);
    if (resultEl) resultEl.textContent = "Testing…";
    try {
      const res = await window.api.testHttp(url);
      const isOk = res.statusCode !== null && res.statusCode < 500;
      const msg = res.error
        ? `Error: ${res.error} (${res.timeMs}ms)`
        : `HTTP ${res.statusCode} · ${res.timeMs}ms`;
      if (resultEl) {
        resultEl.textContent = msg;
        resultEl.className = `http-test-result ${isOk ? "ok" : "err"}`;
      }
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = errorMsg(err, "Test failed.");
        resultEl.className = "http-test-result err";
      }
    }
  } else if (action === "open-auth-url") {
    if (value) void window.api.openExternal(value);
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
  if (IS_FORM_WINDOW) {
    window.close();
    return;
  }
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
  sshKeyPassphraseInput.value = "";
  sshKeyPassphraseInput.placeholder = "Leave empty if key has no passphrase";
  notesInput.value = "";
  updateSshKeyVisibility();
  formTitle.textContent = "New Tunnel";
}

newBtn.addEventListener("click", () => {
  window.api.openFormWindow();
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
    sshKeyPassphrase: sshKeyPassphraseInput.value || undefined,
    keepExistingSshKeyPassphrase: isEdit && !sshKeyPassphraseInput.value,
    notes: notesInput.value.trim(),
    group: groupInput.value.trim(),
    sshKeyPath: sshKeyPathInput.value.trim(),
    jumpHost:
      (document.getElementById("jump-host") as HTMLInputElement)?.value.trim() ||
      undefined,
    jumpPort:
      Number((document.getElementById("jump-port") as HTMLInputElement)?.value) || 22,
  };

  if (!conn.hostname) {
    showToast("Hostname is required.", "error");
    hostInput.focus();
    return;
  }

  try {
    await window.api.saveConnection(conn);
    if (IS_FORM_WINDOW) {
      window.close();
    } else {
      closeModal();
      await refreshConnections();
      showToast("Tunnel saved.", "success");
    }
  } catch (err) {
    showToast(errorMsg(err, "Failed to save."), "error");
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  renderSidebar();
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    searchInput.value = "";
    searchQuery = "";
    renderSidebar();
    searchInput.blur();
  }
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

  if (e.key === "?" && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    showShortcutsOverlay();
    return;
  }
  if (e.ctrlKey && e.shiftKey && (e.key === "O" || e.key === "o")) {
    e.preventDefault();
    document.getElementById("quick-connect")?.click();
    return;
  }
  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    window.api.openFormWindow();
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
    // Apply custom order if set, hide temp connections from sidebar
    const order = currentSettings?.connectionOrder ?? [];
    if (order.length > 0) {
      connections = connections.sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
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

// ─── Log resize handle ────────────────────────────────────────────────────────

if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW) {
  const logResizeHandle = document.getElementById("log-resize-handle") as HTMLElement;
  const logPanelEl = document.querySelector(".log-panel") as HTMLElement;
  let resizeDragging = false;
  let resizeStartY = 0;
  let resizeStartH = 0;

  logResizeHandle.addEventListener("mousedown", (e) => {
    resizeDragging = true;
    resizeStartY = e.clientY;
    resizeStartH = logPanelEl.offsetHeight;
    logResizeHandle.classList.add("dragging");
    document.body.style.cursor = "ns-resize";
    (document.body.style as any).userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!resizeDragging) return;
    const delta = resizeStartY - e.clientY;
    const newH = Math.max(60, Math.min(resizeStartH + delta, window.innerHeight - 200));
    logPanelEl.style.height = `${newH}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!resizeDragging) return;
    resizeDragging = false;
    logResizeHandle.classList.remove("dragging");
    document.body.style.cursor = "";
    (document.body.style as any).userSelect = "";
  });
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW) {
  window.api.onConnectionSaved(async () => {
    await refreshConnections();
  });
}

if (!IS_TERMINAL_WINDOW) {
  window.api.onStatusUpdate((data) => {
    const prev = statuses[data.id];
    statuses[data.id] = data.status;
    if (data.status === "disconnected") {
      rdpClosed.delete(data.id);
      authPendingUrls.delete(data.id);
      sessionConnectedAt.delete(data.id);
      if (data.id === selectedId) {
        stopDebugPoll();
        if (debugMode) setLiveIndicator("not connected", "dim");
      }
      if (prev === "connecting") {
        appendLog(`Connection failed — ${connName(data.id)}`);
        void window.api.showNotification(
          "TunnelDesk",
          `Connection failed — ${connName(data.id)}`,
        );
      } else if (prev === "connected") {
        appendLog(`Tunnel disconnected — ${connName(data.id)}`);
        void window.api.showNotification(
          "TunnelDesk",
          `Disconnected — ${connName(data.id)}`,
        );
      }
    } else if (data.status === "connected" && prev !== "connected") {
      authPendingUrls.delete(data.id);
      sessionConnectedAt.set(data.id, Date.now());
      appendLog(`Tunnel connected — ${connName(data.id)}`);
      void window.api.showNotification("TunnelDesk", `Connected — ${connName(data.id)}`);
    }
    renderSidebar();
    renderDetail();
  });

  window.api.onRdpClosed((data) => {
    rdpClosed.add(data.id);
    appendLog(`RDP window closed — ${connName(data.id)}`);
    if (data.id === selectedId) renderDetail();
  });

  window.api.onRdpReconnected((data) => {
    rdpClosed.delete(data.id);
    appendLog(`RDP reconnected via tunnel — ${connName(data.id)}`);
    renderSidebar();
    if (data.id === selectedId) renderDetail();
  });
}

window.api.onLog((data) => {
  const name = data.id ? connName(data.id) : null;
  const prefix = name ? `[${name}] ` : "";
  appendLog(prefix + data.message);
});

window.api.onDepsStatus((deps) => {
  const missing: string[] = [];
  if (!deps.cloudflared) missing.push("cloudflared");

  const isWin = window.api.platform === "win32";
  const rdpClientName = deps.rdpClient ?? (isWin ? "mstsc" : "xfreerdp");
  const rdpLabel = isWin
    ? "mstsc (Remote Desktop)"
    : `${rdpClientName} (FreeRDP — install with: sudo apt install freerdp2-x11)`;
  if (!deps.mstsc) missing.push(rdpLabel);

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

if (!IS_TERMINAL_WINDOW) {
  window.api.onAuthRequired((data) => {
    authPendingUrls.set(data.id, data.url);
    appendLog(`Cloudflare Access login required — ${connName(data.id)}`);
    showToast("Browser login required — complete sign-in in your browser.", "info");
    if (data.id === selectedId) renderDetail();
  });
}

window.api.onSshData(({ sid, data }) => {
  const loc = sidToTab.get(sid);
  if (!loc) return;
  const state = termState.get(loc.connId);
  const tab = state?.tabs.find((t) => t.tabId === loc.tabId);
  if (tab?.term) tab.term.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
});

window.api.onSshClose(({ sid }) => {
  const loc = sidToTab.get(sid);
  if (!loc) return;
  sidToTab.delete(sid);
  telnetSids.delete(sid);
  const state = termState.get(loc.connId);
  const tab = state?.tabs.find((t) => t.tabId === loc.tabId);
  if (!tab) return;
  tab.closed = true;
  tab.sessionId = null;
  if (tab.term) tab.term.write("\r\n\x1b[31mConnection closed.\x1b[0m\r\n");
  const conn = connections.find((c) => c.id === loc.connId);
  const proto = conn?.protocol ?? "";
  appendLog(
    `${proto === "telnet" ? "Telnet" : "SSH"} session closed — ${connName(loc.connId)}`,
  );
  // For direct-protocol connections: mark disconnected when no live term tabs remain.
  if (proto === "ssh" || proto === "telnet") {
    const hasOpen = state?.tabs.some(
      (t) => t.type === "term" && !t.closed && t.tabId !== loc.tabId,
    );
    if (!hasOpen) void window.api.sshReportStatus(loc.connId, false);
  }
  if (selectedId === loc.connId && conn) renderTerminalDetail(conn);

  // Auto-reconnect: if not cancelled by user and auto-reconnect is enabled
  const maxAttempts = currentSettings?.autoReconnectAttempts ?? 3;
  if (
    currentSettings?.autoReconnect &&
    !tab.cancelled &&
    tab.type === "term" &&
    tab.reconnectAttempt < maxAttempts
  ) {
    const attempt = tab.reconnectAttempt + 1;
    const delay = attempt === 1 ? 3000 : attempt === 2 ? 8000 : 20000;
    tab.reconnecting = true;
    tab.reconnectAttempt = attempt;
    if (tab.term)
      tab.term.write(
        `\r\n\x1b[33mReconnecting (${attempt}/${maxAttempts}) in ${delay / 1000}s…\x1b[0m\r\n`,
      );
    tab.reconnectTimer = setTimeout(async () => {
      if (tab.cancelled) return;
      tab.closed = false;
      tab.reconnecting = false;
      // Reopen a fresh term tab replacing this one
      closeTermTab(loc.connId, loc.tabId);
      void addTermTab(loc.connId, "term");
    }, delay);
  }
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

const termResizeObserver = new ResizeObserver(() => {
  if (selectedId) fitActiveTerminal(selectedId);
});
termResizeObserver.observe(detailPanel);

// ─── Form window initializer ──────────────────────────────────────────────────

async function initFormWindow(connId: string | null): Promise<void> {
  document.body.classList.add("form-window-mode");
  (document.querySelector(".app") as HTMLElement).style.display = "none";
  const root = document.getElementById("form-window-root") as HTMLElement;
  root.classList.remove("hidden");

  // Move the modal card into the form window root
  const modalCard = document.querySelector("#form-modal .modal") as HTMLElement;
  root.appendChild(modalCard);

  if (connId) {
    try {
      const conns: Connection[] = await window.api.loadConnections();
      const conn = conns.find((c) => c.id === connId);
      if (conn) {
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
        sshKeyPassphraseInput.value = "";
        sshKeyPassphraseInput.placeholder = conn.hasSshKeyPassphrase
          ? "Leave empty to keep existing"
          : "Leave empty if key has no passphrase";
        notesInput.value = conn.notes || "";
        const jumpHostEl = document.getElementById(
          "jump-host",
        ) as HTMLInputElement | null;
        const jumpPortEl = document.getElementById(
          "jump-port",
        ) as HTMLInputElement | null;
        if (jumpHostEl) jumpHostEl.value = conn.jumpHost || "";
        if (jumpPortEl) jumpPortEl.value = String(conn.jumpPort ?? 22);
        updateSshKeyVisibility();
        formTitle.textContent = "Edit Tunnel";
      }
    } catch {}
  } else {
    resetForm();
  }
  setTimeout(() => nameInput.focus(), 50);
}

// ─── Terminal-only window initializer ─────────────────────────────────────────

async function initTerminalWindow(connId: string): Promise<void> {
  const root = document.getElementById("term-window-root") as HTMLElement;

  // Show terminal root, hide the main app shell.
  (document.querySelector(".app") as HTMLElement).style.display = "none";
  root.classList.remove("hidden");

  // Redirect detailPanel so renderTerminalDetail writes here instead.
  termResizeObserver.disconnect();
  detailPanel = root;
  termResizeObserver.observe(detailPanel);

  // Load connections so renderTerminalDetail has the Connection object.
  try {
    connections = await window.api.loadConnections();
  } catch {}

  const conn = connections.find((c) => c.id === connId);
  if (!conn) {
    root.innerHTML = `<div class="detail-empty"><div class="detail-empty-sub">Connection not found.</div></div>`;
    return;
  }

  document.title = `${conn.friendlyName || conn.hostname} — Terminal`;
  selectedId = connId;
  await addTermTab(connId, "term");
}

// ─── Sidebar resize ───────────────────────────────────────────────────────────

if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW) {
  const sidebarResizeHandle = document.getElementById("sidebar-resize-handle");
  const sidebarEl = document.querySelector<HTMLElement>(".sidebar");
  if (sidebarResizeHandle && sidebarEl) {
    let resizing = false;
    let startX = 0;
    let startW = 0;
    sidebarResizeHandle.addEventListener("mousedown", (e) => {
      resizing = true;
      startX = e.clientX;
      startW = sidebarEl.offsetWidth;
      sidebarResizeHandle.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      (document.body.style as CSSStyleDeclaration & { userSelect: string }).userSelect =
        "none";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!resizing) return;
      const w = Math.max(180, Math.min(420, startW + e.clientX - startX));
      document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
    });
    document.addEventListener("mouseup", () => {
      if (!resizing) return;
      resizing = false;
      sidebarResizeHandle.classList.remove("dragging");
      document.body.style.cursor = "";
      (document.body.style as CSSStyleDeclaration & { userSelect: string }).userSelect =
        "";
    });
  }
}

// ─── Keyboard shortcuts overlay ───────────────────────────────────────────────

function showShortcutsOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "shortcuts-overlay";
  overlay.innerHTML = `
    <div class="shortcuts-box">
      <div class="shortcuts-title">Keyboard Shortcuts</div>
      <div class="shortcuts-section">Navigation</div>
      <div class="shortcut-row"><span>Select tunnel</span><kbd>↑ / ↓</kbd></div>
      <div class="shortcut-row"><span>New tunnel</span><kbd>Ctrl+N</kbd></div>
      <div class="shortcut-row"><span>Quick Connect</span><kbd>Ctrl+Shift+O</kbd></div>
      <div class="shortcut-row"><span>Settings</span><kbd>Click ⚙</kbd></div>
      <div class="shortcut-row"><span>Clear search</span><kbd>Esc</kbd></div>
      <div class="shortcuts-section">Connection</div>
      <div class="shortcut-row"><span>Connect / Disconnect</span><kbd>Enter</kbd></div>
      <div class="shortcut-row"><span>Delete tunnel</span><kbd>Delete</kbd></div>
      <div class="shortcut-row"><span>Toggle debug</span><kbd>Ctrl+D</kbd></div>
      <div class="shortcuts-section">Terminal</div>
      <div class="shortcut-row"><span>Copy selection</span><kbd>Ctrl+Shift+C</kbd></div>
      <div class="shortcut-row"><span>Paste</span><kbd>Ctrl+Shift+V</kbd></div>
      <div class="shortcut-row"><span>Search</span><kbd>Ctrl+F</kbd></div>
      <div class="shortcut-row"><span>Zoom in / out</span><kbd>Ctrl+= / Ctrl+-</kbd></div>
      <div class="shortcut-row"><span>Reset zoom</span><kbd>Ctrl+0</kbd></div>
      <div class="shortcut-row"><span>Rename tab</span><kbd>Double-click tab</kbd></div>
      <div class="shortcuts-section">Other</div>
      <div class="shortcut-row"><span>This help</span><kbd>?</kbd></div>
    </div>
  `;
  const close = () => {
    if (document.body.contains(overlay)) document.body.removeChild(overlay);
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  document.body.appendChild(overlay);
  (overlay as HTMLElement).setAttribute("tabindex", "-1");
  (overlay as HTMLElement).focus();
}

// ─── Quick Connect ────────────────────────────────────────────────────────────

const quickConnectModal = document.getElementById("quick-connect-modal") as HTMLElement;
const qcForm = document.getElementById("qc-form") as HTMLFormElement;
const qcProto = document.getElementById("qc-protocol") as HTMLSelectElement;
const qcHost = document.getElementById("qc-host") as HTMLInputElement;
const qcPort = document.getElementById("qc-port") as HTMLInputElement;

if (quickConnectModal) {
  const openQc = () => {
    quickConnectModal.classList.remove("hidden");
    quickConnectModal.offsetHeight;
    quickConnectModal.classList.add("open");
    setTimeout(() => qcHost?.focus(), 50);
  };
  const closeQc = () => {
    quickConnectModal.classList.remove("open");
    setTimeout(() => quickConnectModal.classList.add("hidden"), 160);
  };

  document.getElementById("quick-connect")?.addEventListener("click", openQc);
  document.getElementById("qc-cancel")?.addEventListener("click", closeQc);
  document.getElementById("qc-cancel-top")?.addEventListener("click", closeQc);
  quickConnectModal.addEventListener("click", (e) => {
    if (e.target === quickConnectModal) closeQc();
  });

  qcProto?.addEventListener("change", () => {
    if (qcPort) qcPort.value = String(PROTOCOL_DEFAULT_PORTS[qcProto.value] ?? 22);
  });

  qcForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const host = qcHost?.value.trim();
    if (!host) {
      showToast("Host is required.", "error");
      return;
    }
    const proto = qcProto?.value || "ssh";
    const port = Number(qcPort?.value) || 22;
    const user = (document.getElementById("qc-user") as HTMLInputElement)?.value.trim();
    const pass = (document.getElementById("qc-pass") as HTMLInputElement)?.value;
    closeQc();
    try {
      const saved = await window.api.saveConnection({
        friendlyName: `${host} (quick)`,
        hostname: host,
        port,
        protocol: proto,
        username: user || undefined,
        password: pass || undefined,
        temp: true,
      } as Parameters<typeof window.api.saveConnection>[0] & { temp?: boolean });
      await refreshConnections();
      selectedId = saved.id;
      renderSidebar();
      renderDetail();
      await handleAction("connect", saved.id);
    } catch (err) {
      showToast(errorMsg(err, "Quick connect failed."), "error");
    }
  });
}

// ─── Drag-to-reorder connections ──────────────────────────────────────────────

let dragSrcId: string | null = null;

function makeSidebarItemDraggable(item: HTMLElement, connId: string) {
  item.setAttribute("draggable", "true");
  item.addEventListener("dragstart", (e) => {
    dragSrcId = connId;
    e.dataTransfer!.effectAllowed = "move";
  });
  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    item.classList.add("drag-over");
  });
  item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
  item.addEventListener("drop", async (e) => {
    e.preventDefault();
    item.classList.remove("drag-over");
    if (!dragSrcId || dragSrcId === connId) return;
    const ids = connections.map((c) => c.id);
    const from = ids.indexOf(dragSrcId);
    const to = ids.indexOf(connId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragSrcId);
    connections = connections
      .slice()
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    dragSrcId = null;
    renderSidebar();
    try {
      await window.api.saveSettings({ connectionOrder: ids });
      if (currentSettings) currentSettings.connectionOrder = ids;
    } catch {}
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    currentSettings = await window.api.getSettings();
  } catch {}
  applyTheme(currentSettings?.theme ?? "dark");
  await refreshConnections();
  // Clean up any leftover temp connections from a previous crash
  void window.api.deleteTempConnections();
}

if (TERM_WIN_CONN_ID) {
  void initTerminalWindow(TERM_WIN_CONN_ID);
} else if (IS_FORM_WINDOW) {
  void initFormWindow(FORM_WIN_CONN_ID);
} else {
  init();
}
