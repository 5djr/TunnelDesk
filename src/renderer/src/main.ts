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
  managed?: boolean;
}

interface PolicyState {
  configSyncUrl?: string;
  tenantId?: string;
  clientId?: string;
  enforceSSO?: boolean;
  syncInterval?: number;
  disableManualConnections?: boolean;
  bannerMessage?: string;
  allowedProtocols?: string[];
}

interface AuthUser {
  name: string;
  email: string;
  tenantId: string;
  homeAccountId: string;
}

interface AuthStatus {
  signedIn: boolean;
  user: AuthUser | null;
}

interface SyncStatus {
  lastSyncTime: number | null;
  lastSyncError: string | null;
  count: number;
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
  osCache: Record<string, { osInfo: string; cachedAt: number }>;
  osCacheDurationHours: number;
  entraClientId: string;
  entraTenantId: string;
  configSyncUrl: string;
  configSyncInterval: number;
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
        jumpHost?: string;
        jumpPort?: number | null;
        temp?: boolean;
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
      openQcWindow(): Promise<void>;
      openConfirmWindow(message: string): Promise<boolean>;
      confirmResult(result: boolean): Promise<void>;
      sshReportStatus(connId: string, ok: boolean): Promise<void>;
      onStatusUpdate(cb: (data: { id: string; status: ConnectionStatus }) => void): void;
      onLog(cb: (data: { id?: string; message: string }) => void): void;
      onRdpClosed(cb: (data: { id: string }) => void): void;
      onRdpReconnected(cb: (data: { id: string }) => void): void;
      telnetTermCreate(connectionId: string): Promise<string>;
      telnetWrite(sid: string, data: string): Promise<void>;
      telnetResize(sid: string, cols: number, rows: number): Promise<void>;
      telnetCloseSession(sid: string): Promise<void>;
      sshTermCreate(connectionId: string): Promise<string>;
      onSshOsDetected(cb: (d: { sid: string; osInfo: string }) => void): void;
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
      onSettingsDidChange(cb: (settings: Settings) => void): void;
      onUpdateAvailable(cb: (data: { version: string; url: string }) => void): void;
      authSignIn(clientId: string, tenantId: string): Promise<AuthUser>;
      authSignOut(): Promise<void>;
      authGetStatus(): Promise<AuthStatus>;
      syncFetchNow(): Promise<{ count: number }>;
      getManagedConnections(): Promise<Connection[]>;
      getSyncStatus(): Promise<SyncStatus>;
      getPolicy(): Promise<PolicyState>;
      onManagedConnectionsUpdated(
        cb: (data: { connections: Connection[]; policies: PolicyState }) => void,
      ): void;
      onPolicyUpdated(cb: (policy: PolicyState) => void): void;
    };
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let connections: Connection[] = [];
let managedConnections: Connection[] = [];
let currentPolicy: PolicyState = {};
let currentAuthStatus: AuthStatus = { signedIn: false, user: null };
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
const IS_QC_WINDOW = _twParams.get("mode") === "qc";
const IS_CONFIRM_WINDOW = _twParams.get("mode") === "confirm";
const CONFIRM_MESSAGE = _twParams.get("message") ?? "";

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

// ─── Custom Select ────────────────────────────────────────────────────────────

class CustomSelect {
  private native: HTMLSelectElement;
  private wrapper: HTMLDivElement;
  private trigger: HTMLButtonElement;
  private labelEl: HTMLSpanElement;
  private dropdown: HTMLDivElement;
  private isOpen = false;
  private focusedIdx = -1;
  private optionBtns: HTMLButtonElement[] = [];

  constructor(native: HTMLSelectElement) {
    this.native = native;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "custom-select";
    if (native.classList.contains("settings-select")) {
      this.wrapper.classList.add("settings-select");
    }

    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "custom-select-trigger";

    this.labelEl = document.createElement("span");
    this.labelEl.className = "custom-select-label";

    const chevron = document.createElement("span");
    chevron.className = "custom-select-chevron";
    chevron.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,3.5 5,6.5 8,3.5"/></svg>`;

    this.trigger.append(this.labelEl, chevron);

    this.dropdown = document.createElement("div");
    this.dropdown.className = "custom-select-dropdown";
    this.dropdown.hidden = true;

    this.wrapper.append(this.trigger, this.dropdown);
    native.parentNode!.insertBefore(this.wrapper, native);
    native.style.display = "none";

    this.buildOptions();
    this.syncLabel();

    this.trigger.addEventListener("click", () => this.toggle());
    this.trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!this.isOpen) this.open();
        this.moveFocus(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!this.isOpen) this.open();
        this.moveFocus(-1);
      } else if (e.key === "Escape") {
        this.close();
      }
    });

    document.addEventListener("click", (e) => {
      if (this.isOpen && !this.wrapper.contains(e.target as Node)) this.close();
    });
  }

  private buildOptions() {
    this.dropdown.innerHTML = "";
    this.optionBtns = [];
    let idx = 0;
    for (const child of Array.from(this.native.children)) {
      if (child.tagName === "OPTGROUP") {
        const grp = child as HTMLOptGroupElement;
        const groupEl = document.createElement("div");
        groupEl.className = "custom-select-group";
        groupEl.textContent = grp.label;
        this.dropdown.appendChild(groupEl);
        for (const opt of Array.from(grp.children) as HTMLOptionElement[]) {
          this.dropdown.appendChild(this.makeOption(opt, idx++));
        }
      } else if (child.tagName === "OPTION") {
        this.dropdown.appendChild(this.makeOption(child as HTMLOptionElement, idx++));
      }
    }
  }

  private makeOption(opt: HTMLOptionElement, idx: number): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "custom-select-option";
    if (opt.selected) btn.classList.add("selected");
    btn.dataset.value = opt.value;
    btn.textContent = opt.text;
    btn.addEventListener("click", () => this.pick(opt.value));
    btn.addEventListener("mouseenter", () => {
      this.focusedIdx = idx;
      this.highlightFocused();
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.pick(opt.value);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveFocus(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveFocus(-1);
      } else if (e.key === "Escape" || e.key === "Tab") {
        this.close();
        this.trigger.focus();
      }
    });
    this.optionBtns.push(btn);
    return btn;
  }

  private pick(value: string) {
    this.native.value = value;
    this.native.dispatchEvent(new Event("change", { bubbles: true }));
    this.syncLabel();
    this.syncSelected();
    this.close();
    this.trigger.focus();
  }

  private open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.trigger.classList.add("open");
    this.dropdown.hidden = false;
    this.position();
    const sel = this.optionBtns.findIndex((b) => b.dataset.value === this.native.value);
    this.focusedIdx = sel >= 0 ? sel : 0;
    this.highlightFocused();
    this.optionBtns[this.focusedIdx]?.focus();
  }

  private close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.trigger.classList.remove("open");
    this.dropdown.hidden = true;
  }

  private toggle() {
    this.isOpen ? this.close() : this.open();
  }

  private position() {
    const r = this.trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const maxH = 280;
    this.dropdown.style.width = `${r.width}px`;
    this.dropdown.style.left = `${r.left}px`;
    this.dropdown.style.maxHeight = `${Math.min(maxH, Math.max(spaceBelow, spaceAbove) - 8)}px`;
    if (spaceBelow >= spaceAbove || spaceBelow >= 120) {
      this.dropdown.style.top = `${r.bottom + 4}px`;
      this.dropdown.style.bottom = "";
    } else {
      this.dropdown.style.bottom = `${window.innerHeight - r.top + 4}px`;
      this.dropdown.style.top = "";
    }
  }

  private moveFocus(dir: 1 | -1) {
    if (!this.optionBtns.length) return;
    this.focusedIdx = Math.max(
      0,
      Math.min(this.optionBtns.length - 1, this.focusedIdx + dir),
    );
    this.highlightFocused();
    this.optionBtns[this.focusedIdx]?.focus();
  }

  private highlightFocused() {
    this.optionBtns.forEach((b, i) =>
      b.classList.toggle("focused", i === this.focusedIdx),
    );
  }

  private syncLabel() {
    const opt = this.native.options[this.native.selectedIndex];
    this.labelEl.textContent = opt ? opt.text : "";
  }

  private syncSelected() {
    this.optionBtns.forEach((b) =>
      b.classList.toggle("selected", b.dataset.value === this.native.value),
    );
  }

  refresh() {
    this.syncLabel();
    this.syncSelected();
  }
}

const _customSelectMap = new WeakMap<HTMLSelectElement, CustomSelect>();

function initCustomSelects(root: ParentNode = document) {
  root.querySelectorAll<HTMLSelectElement>("select.form-input").forEach((el) => {
    if (!_customSelectMap.has(el)) _customSelectMap.set(el, new CustomSelect(el));
  });
}

function refreshCustomSelect(el: HTMLSelectElement) {
  _customSelectMap.get(el)?.refresh();
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

(function initTooltip() {
  let tip: HTMLDivElement | null = null;
  let hideTimer = 0;

  const show = (text: string, target: HTMLElement) => {
    clearTimeout(hideTimer);
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "td-tooltip";
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    const r = target.getBoundingClientRect();
    const tx = Math.min(r.left + r.width / 2, window.innerWidth - tip.offsetWidth - 8);
    const ty = r.bottom + 6;
    tip.style.left = `${Math.max(4, tx)}px`;
    tip.style.top = `${ty + tip.offsetHeight > window.innerHeight ? r.top - tip.offsetHeight - 6 : ty}px`;
  };

  const hide = () => {
    hideTimer = window.setTimeout(() => {
      tip?.remove();
      tip = null;
    }, 80);
  };

  document.addEventListener("mouseover", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tooltip]");
    if (el) show(el.dataset.tooltip!, el);
  });
  document.addEventListener("mouseout", (e) => {
    if ((e.target as HTMLElement).closest("[data-tooltip]")) hide();
  });
  document.addEventListener("mousedown", () => {
    tip?.remove();
    tip = null;
  });
})();

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

// Inline brand logos used inside the Protocol detail row.
const _LOGO_MS = `<svg width="12" height="12" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:3px;flex-shrink:0;display:inline-block"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>`;
const _LOGO_CF = `<svg width="16" height="13" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:3px;flex-shrink:0;display:inline-block" fill="#F6821F"><path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727"/></svg>`;

function protocolLabelHtml(p: string): string {
  switch (p) {
    case "rdp-cf":
      return `${_LOGO_MS}RDP&thinsp;/&thinsp;${_LOGO_CF}Cloudflare Access`;
    case "rdp":
      return `${_LOGO_MS}RDP / Direct`;
    case "ssh-cf":
      return `SSH&thinsp;/&thinsp;${_LOGO_CF}Cloudflare Access`;
    case "ssh":
      return "SSH / Direct";
    case "telnet":
      return "Telnet";
    case "http":
      return "HTTP";
    case "https":
      return "HTTPS";
    default:
      return escapeHtml(p);
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
  return !formModal.classList.contains("hidden");
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
  | { title: string }
  | { label: string; disabled?: boolean; danger?: boolean; action: () => void };

function showDropdownMenu(x: number, y: number, items: MenuEntry[]): void {
  const old = document.getElementById("_td-dropdown");
  if (old) old.remove();

  const menu = document.createElement("div");
  menu.id = "_td-dropdown";
  menu.className = "td-dropdown";
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
      sep.className = "td-dropdown-sep";
      menu.appendChild(sep);
      continue;
    }
    if ("title" in entry) {
      const wrap = document.createElement("div");
      wrap.className = "td-dropdown-title";
      const chip = document.createElement("span");
      chip.className = "td-dropdown-title-chip";
      chip.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>${escapeHtml(entry.title)}`;
      wrap.appendChild(chip);
      menu.appendChild(wrap);
      continue;
    }
    const el = document.createElement("div");
    el.className =
      "td-dropdown-item" +
      (entry.disabled ? " disabled" : "") +
      (entry.danger ? " danger" : "");
    el.textContent = entry.label;
    if (!entry.disabled) {
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
  if (!termState.has(connId))
    termState.set(connId, { tabs: [], activeTabId: null, osInfo: "unknown" });
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
        sid = await window.api.sshTermCreate(connId);
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

// ─── OS / distro icon ────────────────────────────────────────────────────────

function getOsIcon(os: string, size = 14): string {
  const s = (os || "").toLowerCase().replace(/-/g, "");
  const d = `width="${size}" height="${size}" viewBox="0 0 24 24"`;
  // Windows — official Microsoft flag (F25022/7FBA00/00A4EF/FFB900)
  if (s === "windows" || s === "windowsnt")
    return `<svg ${d}><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>`;
  // Ubuntu — SimpleIcons official path (E95420)
  if (s.startsWith("ubuntu"))
    return `<svg ${d} fill="#E95420"><path d="M17.61.455a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zM12.92.8C8.923.777 5.137 2.941 3.148 6.451a4.5 4.5 0 0 1 .26-.007 4.92 4.92 0 0 1 2.585.737A8.316 8.316 0 0 1 12.688 3.6 4.944 4.944 0 0 1 13.723.834 11.008 11.008 0 0 0 12.92.8zm9.226 4.994a4.915 4.915 0 0 1-1.918 2.246 8.36 8.36 0 0 1-.273 8.303 4.89 4.89 0 0 1 1.632 2.54 11.156 11.156 0 0 0 .559-13.089zM3.41 7.932A3.41 3.41 0 0 0 0 11.342a3.41 3.41 0 0 0 3.41 3.409 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zm2.027 7.866a4.908 4.908 0 0 1-2.915.358 11.1 11.1 0 0 0 7.991 6.698 11.234 11.234 0 0 0 2.422.249 4.879 4.879 0 0 1-.999-2.85 8.484 8.484 0 0 1-.836-.136 8.304 8.304 0 0 1-5.663-4.32zm11.405.928a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41z"/></svg>`;
  // Debian — SimpleIcons official path (A80030)
  if (s === "debian")
    return `<svg ${d} fill="#A80030"><path d="M13.88 12.685c-.4 0 .08.2.601.28.14-.1.27-.22.39-.33a3.001 3.001 0 01-.99.05m2.14-.53c.23-.33.4-.69.47-1.06-.06.27-.2.5-.33.73-.75.47-.07-.27 0-.56-.8 1.01-.11.6-.14.89m.781-2.05c.05-.721-.14-.501-.2-.221.07.04.13.5.2.22M12.38.31c.2.04.45.07.42.12.23-.05.28-.1-.43-.12m.43.12l-.15.03.14-.01V.43m6.633 9.944c.02.64-.2.95-.38 1.5l-.35.181c-.28.54.03.35-.17.78-.44.39-1.34 1.22-1.62 1.301-.201 0 .14-.25.19-.34-.591.4-.481.6-1.371.85l-.03-.06c-2.221 1.04-5.303-1.02-5.253-3.842-.03.17-.07.13-.12.2a3.551 3.552 0 012.001-3.501 3.361 3.362 0 013.732.48 3.341 3.342 0 00-2.721-1.3c-1.18.01-2.281.76-2.651 1.57-.6.38-.67 1.47-.93 1.661-.361 2.601.66 3.722 2.38 5.042.27.19.08.21.12.35a4.702 4.702 0 01-1.53-1.16c.23.33.47.66.8.91-.55-.18-1.27-1.3-1.48-1.35.93 1.66 3.78 2.921 5.261 2.3a6.203 6.203 0 01-2.33-.28c-.33-.16-.77-.51-.7-.57a5.802 5.803 0 005.902-.84c.44-.35.93-.94 1.07-.95-.2.32.04.16-.12.44.44-.72-.2-.3.46-1.24l.24.33c-.09-.6.74-1.321.66-2.262.19-.3.2.3 0 .97.29-.74.08-.85.15-1.46.08.2.18.42.23.63-.18-.7.2-1.2.28-1.6-.09-.05-.28.3-.32-.53 0-.37.1-.2.14-.28-.08-.05-.26-.32-.38-.861.08-.13.22.33.34.34-.08-.42-.2-.75-.2-1.08-.34-.68-.12.1-.4-.3-.34-1.091.3-.25.34-.74.54.77.84 1.96.981 2.46-.1-.6-.28-1.2-.49-1.76.16.07-.26-1.241.21-.37A7.823 7.824 0 0017.702 1.6c.18.17.42.39.33.42-.75-.45-.62-.48-.73-.67-.61-.25-.65.02-1.06 0C15.082.73 14.862.8 13.8.4l.05.23c-.77-.25-.9.1-1.73 0-.05-.04.27-.14.53-.18-.741.1-.701-.14-1.431.03.17-.13.36-.21.55-.32-.6.04-1.44.35-1.18.07C9.6.68 7.847 1.3 6.867 2.22L6.838 2c-.45.54-1.96 1.611-2.08 2.311l-.131.03c-.23.4-.38.85-.57 1.261-.3.52-.45.2-.4.28-.6 1.22-.9 2.251-1.16 3.102.18.27 0 1.65.07 2.76-.3 5.463 3.84 10.776 8.363 12.006.67.23 1.65.23 2.49.25-.99-.28-1.12-.15-2.08-.49-.7-.32-.85-.7-1.34-1.13l.2.35c-.971-.34-.57-.42-1.361-.67l.21-.27c-.31-.03-.83-.53-.97-.81l-.34.01c-.41-.501-.63-.871-.61-1.161l-.111.2c-.13-.21-1.52-1.901-.8-1.511-.13-.12-.31-.2-.5-.55l.14-.17c-.35-.44-.64-1.02-.62-1.2.2.24.32.3.45.33-.88-2.172-.93-.12-1.601-2.202l.15-.02c-.1-.16-.18-.34-.26-.51l.06-.6c-.63-.74-.18-3.102-.09-4.402.07-.54.53-1.1.88-1.981l-.21-.04c.4-.71 2.341-2.872 3.241-2.761.43-.55-.09 0-.18-.14.96-.991 1.26-.7 1.901-.88.7-.401-.6.16-.27-.151 1.2-.3.85-.7 2.421-.85.16.1-.39.14-.52.26 1-.49 3.151-.37 4.562.27 1.63.77 3.461 3.011 3.531 5.132l.08.02c-.04.85.13 1.821-.17 2.711l.2-.42M9.54 13.236l-.05.28c.26.35.47.73.8 1.01-.24-.47-.42-.66-.75-1.3m.62-.02c-.14-.15-.22-.34-.31-.52.08.32.26.6.43.88l-.12-.36m10.945-2.382l-.07.15c-.1.76-.34 1.511-.69 2.212.4-.73.65-1.541.75-2.362M12.45.12c.27-.1.66-.05.95-.12-.37.03-.74.05-1.1.1l.15.02M3.006 5.142c.07.57-.43.8.11.42.3-.66-.11-.18-.1-.42m-.64 2.661c.12-.39.15-.62.2-.84-.35.44-.17.53-.2.83"/></svg>`;
  // Fedora — SimpleIcons official path (51A2DA)
  if (s === "fedora")
    return `<svg ${d} fill="#51A2DA"><path d="M12.001 0C5.376 0 .008 5.369 .004 11.992H.002v9.287h.002A2.726 2.726 0 0 0 2.73 24h9.275c6.626-.004 11.993-5.372 11.993-11.997C23.998 5.375 18.628 0 12 0zm2.431 4.94c2.015 0 3.917 1.543 3.917 3.671 0 .197.001.395-.03.619a1.002 1.002 0 0 1-1.137 .893 1.002 1.002 0 0 1-.842-1.175a2.61 2.61 0 0 0 .013-.337c0-1.207-.987-1.672-1.92-1.672-.934 0-1.775.784-1.777 1.672.016 1.027 0 2.046 0 3.07l1.732-.012c1.352-.028 1.368 2.009.016 1.998l-1.748.013c-.004.826.006.677.002 1.093 0 0 .015 1.01-.016 1.776-.209 2.25-2.124 4.046-4.424 4.046-2.438 0-4.448-1.993-4.448-4.437.073-2.515 2.078-4.492 4.603-4.469l1.409-.01v1.996l-1.409.013h-.007c-1.388.04-2.577.984-2.6 2.47a2.438 2.438 0 0 0 2.452 2.439c1.356 0 2.441-.987 2.441-2.437l-.001-7.557c0-.14.005-.252.02-.407.23-1.848 1.883-3.256 3.754-3.256z"/></svg>`;
  // Arch Linux — SimpleIcons official path (1793D1)
  if (s === "arch" || s === "archlinux")
    return `<svg ${d} fill="#1793D1"><path d="M11.39.605C10.376 3.092 9.764 4.72 8.635 7.132c.693.734 1.543 1.589 2.923 2.554-1.484-.61-2.496-1.224-3.252-1.86C6.86 10.842 4.596 15.138 0 23.395c3.612-2.085 6.412-3.37 9.021-3.862a6.61 6.61 0 01-.171-1.547l.003-.115c.058-2.315 1.261-4.095 2.687-3.973 1.426.12 2.534 2.096 2.478 4.409a6.52 6.52 0 01-.146 1.243c2.58.505 5.352 1.787 8.914 3.844-.702-1.293-1.33-2.459-1.929-3.57-.943-.73-1.926-1.682-3.933-2.713 1.38.359 2.367.772 3.137 1.234-6.09-11.334-6.582-12.84-8.67-17.74zM22.898 21.36v-.623h-.234v-.084h.562v.084h-.234v.623h.331v-.707h.142l.167.5.034.107a2.26 2.26 0 01.038-.114l.17-.493H24v.707h-.091v-.593l-.206.593h-.084l-.205-.602v.602h-.091"/></svg>`;
  // Alpine Linux — SimpleIcons official path (0D597F)
  if (s === "alpine")
    return `<svg ${d} fill="#0D597F"><path d="M5.998 1.607L0 12l5.998 10.393h12.004L24 12 18.002 1.607H5.998zM9.965 7.12L12.66 9.9l1.598 1.595.002-.002 2.41 2.363c-.2.14-.386.252-.563.344a3.756 3.756 0 01-.496.217 2.702 2.702 0 01-.425.111c-.131.023-.25.034-.358.034-.13 0-.242-.014-.338-.034a1.317 1.317 0 01-.24-.072.95.95 0 01-.2-.113l-1.062-1.092-3.039-3.041-1.1 1.053-3.07 3.072a.974.974 0 01-.2.111 1.274 1.274 0 01-.237.073c-.096.02-.209.033-.338.033-.108 0-.227-.009-.358-.031a2.7 2.7 0 01-.425-.114 3.748 3.748 0 01-.496-.217 5.228 5.228 0 01-.563-.343l6.803-6.727zm4.72.785l4.579 4.598 1.382 1.353a5.24 5.24 0 01-.564.344 3.73 3.73 0 01-.494.217 2.697 2.697 0 01-.426.111c-.13.023-.251.034-.36.034-.129 0-.241-.014-.337-.034a1.285 1.285 0 01-.385-.146c-.033-.02-.05-.036-.053-.04l-1.232-1.218-2.111-2.111-.334.334L12.79 9.8l1.896-1.897zm-5.966 4.12v2.529a2.128 2.128 0 01-.356-.035 2.765 2.765 0 01-.422-.116 3.708 3.708 0 01-.488-.214 5.217 5.217 0 01-.555-.34l1.82-1.825Z"/></svg>`;
  // CentOS — SimpleIcons official path (262577)
  if (s === "centos")
    return `<svg ${d} fill="#262577"><path d="M12.076.066L8.883 3.28H3.348v5.434L0 12.01l3.349 3.298v5.39h5.374l3.285 3.236 3.285-3.236h5.43v-5.374L24 12.026l-3.232-3.252V3.321H15.31zm0 .749l2.49 2.506h-1.69v6.441l-.8.805-.81-.815V3.28H9.627zm-8.2 2.991h4.483L6.485 5.692l4.253 4.279v.654H9.94L5.674 6.423l-1.798 1.77zm5.227 0h1.635v5.415l-3.509-3.53zm4.302.043h1.687l1.83 1.842-3.517 3.539zm2.431 0h4.404v4.394l-1.83-1.842-4.241 4.267h-.764v-.69l4.261-4.287zm2.574 3.3l1.83 1.843v1.676h-5.327zm-12.735.013l3.515 3.462H3.876v-1.69zM3.348 9.454v1.697h6.377l.871.858-.782.77H3.35v1.786L.753 12.01zm17.42.068l2.488 2.503-2.533 2.55v-1.796h-6.41l-.75-.754.825-.83h6.38zm-9.502.978l.81.815.186-.188.614-.618v.686h.768l-.825.83.75.754h-.719v.808l-.842-.83-.741.73v-.707h-.7l.781-.77-.188-.186-.682-.672h.788zm-7.39 2.807h5.402l-3.603 3.55-1.798-1.772zm6.154 0h.708v.7l-4.404 4.338 1.852 1.824h-4.31v-4.342l1.798 1.77zm3.348 0h.715l4.317 4.343.186-.187 1.599-1.61v4.316h-4.366l1.853-1.825-.188-.185-4.116-4.054zm1.46 0h5.357v1.798l-1.785 1.796zm-2.83.191l.842.829v6.37h1.691l-2.532 2.495-2.533-2.495h1.79V14.23zm-1.27 1.251v5.42H8.939l-1.852-1.823zm2.64.097l3.552 3.499-1.853 1.825h-1.7z"/></svg>`;
  // Rocky Linux — SimpleIcons official path (10B981)
  if (s === "rocky")
    return `<svg ${d} fill="#10B981"><path d="M23.332 15.957c.433-1.239.668-2.57.668-3.957 0-6.627-5.373-12-12-12S0 5.373 0 12c0 3.28 1.315 6.251 3.447 8.417L15.62 8.245l3.005 3.005zm-2.192 3.819l-5.52-5.52L6.975 22.9c1.528.706 3.23 1.1 5.025 1.1 3.661 0 6.94-1.64 9.14-4.224z"/></svg>`;
  // AlmaLinux — SimpleIcons official path (0F4E8B)
  if (s === "almalinux")
    return `<svg ${d} fill="#0F4E8B"><path d="M23.994 15.133c.079 1.061-.668 1.927-1.69 2.005a1.8 1.8 0 0 1-1.928-1.651c-.078-1.062.63-1.849 1.691-1.967 1.023-.078 1.849.59 1.927 1.613zm-12.623 4.955c-.944 0-1.73.786-1.73 1.809 0 1.14.747 1.848 1.887 1.848.904-.04 1.691-.865 1.691-1.809 0-.983-.904-1.848-1.848-1.848zm1.061-9.675c-.039-.865-.078-1.73.08-2.556.156-.944.314-1.887.904-2.674.707-.983 1.809-.944 2.399.118.314.511.432 1.062.471 1.652 0 .354.158.432.472.393.944-.157 1.888-.157 2.792.197.118.039.236.118.394 0 .314-.276.393-1.652.196-2.006-.354-.63-.904-.55-1.455-.55-.629.039-1.18-.158-1.612-.67-.393-.471-.511-1.06-.59-1.65-.04-.276-.079-.512-.315-.709-.55-.55-1.809-.432-2.477.118-2.556 2.045-2.989 5.467-1.534 8.18.04.118.118.236.275.157zm7.984 3.658c.354-.511.865-.747 1.415-.983a.973.973 0 0 0 .59-.472c.354-.669-.078-1.81-.747-2.36-2.595-2.006-5.938-1.612-8.18.433-.118.078-.157.196-.078.314.786-.236 1.612-.472 2.477-.51.905-.08 1.848-.158 2.753.235 1.14.472 1.337 1.534.472 2.36-.393.393-.905.668-1.455.825-.315.08-.354.236-.236.551.354.865.59 1.77.472 2.753-.04.157-.079.275.078.393.354.236 1.691 0 1.967-.275.511-.472.314-1.023.196-1.534-.157-.63-.078-1.219.276-1.73zm-7.197-2.045c-.118-.079-.197-.118-.315 0 .472.708.905 1.455 1.259 2.241.314.866.668 1.73.55 2.714-.118 1.18-1.1 1.69-2.123 1.101-.511-.275-.905-.669-1.22-1.14-.196-.276-.393-.276-.629-.08-.747.63-1.533 1.102-2.516 1.26-.158 0-.315 0-.394.157-.118.393.472 1.612.826 1.809.59.354 1.062 0 1.534-.276.55-.314 1.101-.432 1.73-.236.59.197.983.63 1.337 1.102.158.196.315.353.63.432.747.197 1.77-.59 2.084-1.376 1.18-3.028-.157-6.135-2.753-7.708zm-2.556 2.438c.472-.669.826-1.416.983-2.202-.157-.04-.197.04-.315.078-.904.944-1.848 1.849-3.067 2.478-.472.236-.983.433-1.534.433-.865 0-1.376-.551-1.298-1.416a2.92 2.92 0 0 1 .787-1.849c.236-.275.236-.432-.04-.668-.786-.55-1.494-1.22-1.848-2.124-.078-.275-.275-.275-.51-.157a4.293 4.293 0 0 0-.434.236c-1.022.63-1.14 1.416-.275 2.28.63.63.944 1.338.708 2.203-.118.433-.354.747-.63 1.101a.95.95 0 0 0-.235.787c.079.747.826 1.494 1.73 1.573 2.517.236 4.562-.63 5.978-2.753zm-4.68-5.152c1.376 1.18 3.067 1.455 4.837 1.377.157 0 .315 0 .354-.118.04-.197-.157-.197-.275-.236-.826-.354-1.691-.63-2.438-1.14S6.848 8.25 6.534 7.266c-.236-.747.078-1.415.825-1.651.669-.236 1.337-.236 1.967 0 .393.157.55.078.629-.354.118-.747.354-1.455.826-2.085.55-.786.55-.865-.354-1.376-.04 0-.04-.04-.079-.04-.865-.471-1.534-.196-1.848.709-.472 1.376-1.377 1.887-2.832 1.612-.196-.04-.393-.079-.472-.079-.747.118-1.18.55-1.297 1.14-.158 1.81.786 3.107 2.084 4.17zm-2.32 3.658c-.079-.944-1.023-1.652-2.045-1.534-.905.079-1.691 1.022-1.613 1.966.08.983 1.023 1.77 1.967 1.652 1.14-.079 1.73-1.18 1.69-2.084zm15.18-8.298c.943-.079 1.73-.983 1.651-1.927-.078-.983-1.022-1.77-2.005-1.691-1.023.079-1.73.983-1.652 1.966s.983 1.73 2.006 1.652zm-12.27-.826c1.062-.157 1.77-1.023 1.652-2.045C8.107.897 7.163.149 6.18.267c-1.062.118-1.691.944-1.573 2.085.118.865 1.061 1.612 1.966 1.494z"/></svg>`;
  // Red Hat — SimpleIcons official path (EE0000)
  if (s === "rhel")
    return `<svg ${d} fill="#EE0000"><path d="M16.009 13.386c1.577 0 3.86-.326 3.86-2.202a1.765 1.765 0 0 0-.04-.431l-.94-4.08c-.216-.898-.406-1.305-1.982-2.093-1.223-.625-3.888-1.658-4.676-1.658-.733 0-.947.946-1.822.946-.842 0-1.467-.706-2.255-.706-.757 0-1.25.515-1.63 1.576 0 0-1.06 2.99-1.197 3.424a.81.81 0 0 0-.028.245c0 1.162 4.577 4.974 10.71 4.974m4.101-1.435c.218 1.032.218 1.14.218 1.277 0 1.765-1.984 2.745-4.593 2.745-5.895.004-11.06-3.451-11.06-5.734a2.326 2.326 0 0 1 .19-.925C2.746 9.415 0 9.794 0 12.217c0 3.969 9.405 8.861 16.851 8.861 5.71 0 7.149-2.582 7.149-4.62 0-1.605-1.387-3.425-3.887-4.512"/></svg>`;
  // Kali Linux — SimpleIcons official path (557C94)
  if (s === "kali" || s === "kalirolling")
    return `<svg ${d} fill="#557C94"><path d="M12.778 5.943s-1.97-.13-5.327.92c-3.42 1.07-5.36 2.587-5.36 2.587s5.098-2.847 10.852-3.008zm7.351 3.095l.257-.017s-1.468-1.78-4.278-2.648c1.58.642 2.954 1.493 4.021 2.665zm.42.74c.039-.068.166.217.263.337.004.024.01.039-.045.027-.005-.025-.013-.032-.013-.032s-.135-.08-.177-.137c-.041-.057-.049-.157-.028-.195zm3.448 8.479s.312-3.578-5.31-4.403a18.277 18.277 0 0 0-2.524-.187c-4.506.06-4.67-5.197-1.275-5.462 1.407-.116 3.087.643 4.73 1.408-.007.204.002.385.136.552.134.168.648.35.813.445.164.094.691.43 1.014.85.07-.131.654-.512.654-.512s-.14.003-.465-.119c-.326-.122-.713-.49-.722-.511-.01-.022-.015-.055.06-.07.059-.049-.072-.207-.13-.265-.058-.058-.445-.716-.454-.73-.009-.016-.012-.031-.04-.05-.085-.027-.46.04-.46.04s-.575-.283-.774-.893c.003.107-.099.224 0 .469-.3-.127-.558-.344-.762-.88-.12.305 0 .499 0 .499s-.707-.198-.82-.85c-.124.293 0 .469 0 .469s-1.153-.602-3.069-.61c-1.283-.118-1.55-2.374-1.43-2.754 0 0-1.85-.975-5.493-1.406-3.642-.43-6.628-.065-6.628-.065s6.45-.31 11.617 1.783c.176.785.704 2.094.989 2.723-.815.563-1.733 1.092-1.876 2.97-.143 1.878 1.472 3.53 3.474 3.58 1.9.102 3.214.116 4.806.942 1.52.84 2.766 3.4 2.89 5.703.132-1.709-.509-5.383-3.5-6.498 4.181.732 4.549 3.832 4.549 3.832zM12.68 5.663l-.15-.485s-2.484-.441-5.822-.204C3.37 5.211 0 6.38 0 6.38s6.896-1.735 12.68-.717Z"/></svg>`;
  // Raspberry Pi OS — SimpleIcons official path (A22846)
  if (s === "raspbian" || s === "raspios")
    return `<svg ${d} fill="#A22846"><path d="m19.8955 10.8961-.1726-.3028c.0068-2.1746-1.0022-3.061-2.1788-3.7348.356-.0938.7237-.1711.8245-.6182.6118-.1566.7397-.4398.8011-.7398.16-.1066.6955-.4061.6394-.9211.2998-.2069.4669-.4725.3819-.8487.3222-.3515.407-.6419.2702-.9096.3868-.4805.2152-.7295.05-.9817.2897-.5254.0341-1.0887-.7758-.9944-.3221-.4733-1.0244-.3659-1.133-.3637-.1215-.1519-.2819-.2821-.7755-.219-.3197-.2851-.6771-.2364-1.0458-.0964-.4378-.3403-.7275-.0675-1.0584.0356-.53-.1706-.6513.0631-.9117.1583-.5781-.1203-.7538.1416-1.0309.4182l-.3224-.0063c-.8719.5061-1.305 1.5366-1.4585 2.0664-.1536-.5299-.5858-1.5604-1.4575-2.0664l-.3223.0063C9.942.5014 9.7663.2394 9.1883.3597 8.9279.2646 8.807.0309 8.2766.2015c-.2172-.0677-.417-.2084-.6522-.2012l.0004.0002C7.5017.0041 7.369.049 7.2185.166c-.3688-.1401-.7262-.1887-1.0459.0964-.4936-.0631-.654.0671-.7756.219C5.2887.4791 4.5862.3717 4.264.845c-.8096-.0943-1.0655.4691-.7756.9944-.1653.2521-.3366.5013.05.9819-.1367.2677-.0519.5581.2703.9096-.085.3763.0822.6418.3819.8487-.0561.515.4795.8144.6394.9211.0614.3001.1894.5832.8011.7398.1008.4472.4685.5244.8245.6183-1.1766.6737-2.1856 1.56-2.1788 3.7348l-.1724.3028c-1.3491.8082-2.5629 3.4056-.6648 5.5167.124.6609.3319 1.1355.5171 1.6609.2769 2.117 2.0841 3.1082 2.5608 3.2255.6984.524 1.4423 1.0212 2.449 1.3696.949.964 1.977 1.3314 3.0107 1.3308.0152 0 .0306.0002.0457 0 1.0337.0006 2.0618-.3668 3.0107-1.3308 1.0067-.3483 1.7506-.8456 2.4491-1.3696.4766-.1173 2.2838-1.1085 2.5607-3.2255.1851-.5253.3931-1 .517-1.6609 1.8981-2.1113.6843-4.7089-.6649-5.517zm-1.0386-.3715c-.0704.8759-4.6354-3.0504-3.8472-3.1808 2.1391-.3558 3.9191.896 3.8472 3.1808zm-2.0155 4.3649c-1.1481.7409-2.8025.2626-3.6953-1.0681-.8928-1.3306-.6858-3.0101.4623-3.7509 1.1481-.7409 2.8025-.2627 3.6953 1.068.8927 1.3307.6858 3.0101-.4623 3.751zM13.6591 1.3721c.0396.1967.0843.321.1354.3577.2537-.272.4611-.5506.7878-.8123.0011.1537-.0776.3205.1169.4425.1752-.2356.4119-.4459.7263-.6244-.1514.2611-.026.3404.0554.4486.24-.2059.4681-.4144.9109-.5759-.121.1474-.2902.2914-.1108.4607.2473-.1544.496-.3086 1.0833-.4183-.1323.1475-.4059.295-.2401.4426.3104-.1186.6539-.2047 1.034-.2546-.182.1496-.3337.2963-.1846.4122.3323-.1022.7899-.2398 1.2372-.1212l-.2832.2849c-.0314.0382.6623.0297 1.1202.0364-.167.2321-.3375.4562-.437.8548.0454.0459.2723.0204.4862 0-.2194.4618-.6004.5783-.6893.776.134.1015.32.075.5232.006-.158.3254-.4892.5484-.7509.8123.0662.047.1818.075.4555.0425-.2418.257-.5339.492-.8802.7032.0614.0708.2722.0681.4678.0727-.3136.3069-.7173.466-1.0955.6668.1885.1288.3234.0988.4678.097-.2676.2198-.7225.3342-1.1448.4668.0803.1249.1607.1589.3324.194-.447.2473-1.0873.1343-1.2679.2607.0435.1243.1665.2053.3139.2728-.7197.0418-2.6879-.0262-3.0652-1.5156.7367-.8094 2.0813-1.7593 4.394-2.934-1.7994.6022-3.4229 1.405-4.7817 2.5096-1.5978-.7436-.4965-2.6197.283-3.3645zm-1.6126 5.3718c1.1329-.0123 2.5356.8325 2.53 1.6286-.005.7027-.9851 1.2715-2.5213 1.2607-1.5043-.0177-2.5172-.7148-2.5137-1.3957.003-.5603 1.2282-1.5263 2.505-1.4936zm-5.7646-.6006c.1717-.0351.252-.0692.3323-.194-.4223-.1327-.8772-.247-1.1448-.4668.1444.0018.2792.0318.4678-.097-.3783-.2008-.782-.3599-1.0956-.6668.1955-.0048.4064-.002.4677-.0728-.3462-.2113-.6383-.4463-.8801-.7033.2738.0325.3893.0045.4555-.0425-.2617-.264-.593-.487-.7509-.8123.2032.069.3892.0954.5232-.006-.089-.1977-.47-.3142-.6894-.776.214.0204.4409.0459.4863 0-.0994-.3985-.2698-.6226-.4369-.8547.4579-.0067 1.1516.0018 1.1202-.0364l-.2831-.2849c.4472-.1186.9049.019 1.2371.1213.1492-.1159-.0026-.2626-.1847-.4123.3801.05.7236.1361 1.034.2547.1659-.1476-.1076-.2951-.24-.4426.5872.1097.8361.2639 1.0833.4183.1794-.1694.0103-.3133-.1108-.4607.4428.1615.6709.37.911.5759.0814-.1082.2068-.1875.0554-.4486.3143.1785.5511.3888.7263.6244.1945-.122.1159-.2888.1169-.4426.3267.2618.534.5404.7879.8124.0511-.0366.0959-.161.1354-.3577.7794.7448 1.8807 2.6208.2831 3.3646-1.3589-1.1039-2.9817-1.9064-4.78-2.5086 2.3115 1.174 3.6556 2.1239 4.392 2.9328-.3773 1.4895-2.3455 1.5575-3.0651 1.5157.1473-.0676.2703-.1485.3139-.2728-.1806-.1264-.8209-.0134-1.2679-.2607zm2.8175 1.1334c.7881.1304-3.7769 4.0567-3.8472 3.1809-.0719-2.2846 1.7079-3.5367 3.8472-3.1809zm-4.847 8.7567c-1.1094-.8789-1.4668-3.4529.5901-4.6097 1.2394-.3273.4184 5.051-.5901 4.6097zm4.2656 4.5989c-.6257.3719-2.1452.2187-3.2252-1.3095-.7283-1.2823-.6345-2.5872-.123-2.9705.7648-.4589 1.9464.1609 2.8559 1.2003.7923.9405 1.1536 2.5927.4923 3.0797zm-1.2415-5.6086c-1.1481-.7409-1.3551-2.4203-.4623-3.7511.8928-1.3307 2.5472-1.8089 3.6952-1.068 1.1481.7409 1.3551 2.4203.4623 3.7509-.8926 1.3308-2.5471 1.809-3.6952 1.0682zm4.7948 8.2279c-1.3763.0584-2.7258-1.1105-2.7081-1.5157-.0206-.594 1.6758-1.0578 2.782-1.0306 1.1131-.0479 2.6068.3531 2.6097.8851.0184.5166-1.3547 1.6838-2.6836 1.6612zm2.7584-5.8578c.0081 1.3899-1.226 2.5225-2.7562 2.5299-1.5302.0073-2.7773-1.1135-2.7854-2.5033v-.0265c-.008-1.3899 1.2259-2.5226 2.7562-2.5299 1.5302-.0073 2.7773 1.1134 2.7853 2.5033a.7794.7794 0 0 1 .0001.0265zm3.855 2.0029c-1.186 1.6208-2.7916 1.684-3.3896 1.2325-.6255-.5811-.148-2.3854.7094-3.3747v-.0003c.9812-1.0912 2.0302-1.8037 2.7609-1.2469.4919.4828.7805 2.3008-.0807 3.3894zm1.0724-3.4301c-1.0086.4413-1.8298-4.9372-.5901-4.61 2.0568 1.1569 1.6994 3.731.5901 4.61zm-.0256-8.3279h.2985v-.5304h.2986c.1502 0 .2053.0624.2262.2052.0152.1088.0113.2395.0477.3253h.2984c-.0533-.0763-.0515-.2358-.0571-.3213-.0097-.1373-.0513-.2796-.1977-.3176v-.0037c.1502-.061.2149-.1807.2149-.341 0-.2048-.1539-.3738-.3974-.3738h-.732v1.3573zm.2985-1.1255h.3269c.1333 0 .2054.0573.2054.188 0 .1369-.0721.1942-.2054.1942H20.03v-.3822zm-1.0337.4633c0 .7009.5682 1.2694 1.2695 1.2694s1.2695-.5684 1.2695-1.2694c0-.7013-.5683-1.2697-1.2695-1.2697-.7013 0-1.2695.5684-1.2695 1.2697zm2.3275 0c0 .5845-.4737 1.058-1.058 1.058s-1.058-.4735-1.058-1.058c0-.5849.4737-1.058 1.058-1.058s1.058.4731 1.058 1.058z"/></svg>`;
  // openSUSE — SimpleIcons official path (73BA25)
  if (s.startsWith("opensuse") || s === "sles")
    return `<svg ${d} fill="#73BA25"><path d="M10.724 0a12 12 0 0 0-9.448 4.623c1.464.391 2.5.727 2.81.832.005-.19.037-1.893.037-1.893s.004-.04.025-.06c.026-.026.065-.018.065-.018.385.056 8.602 1.274 12.066 3.292.427.25.638.517.902.786.958.99 2.223 5.108 2.359 5.957.005.033-.036.07-.054.083a5.177 5.177 0 0 1-.313.228c-.82.55-2.708 1.872-5.13 1.656-2.176-.193-5.018-1.44-8.445-3.699.336.79.668 1.58 1 2.371.497.258 5.287 2.7 7.651 2.651 1.904-.04 3.941-.968 4.756-1.458 0 0 .179-.108.257-.048.085.066.061.167.041.27-.05.234-.164.66-.242.863l-.065.165c-.093.25-.183.482-.356.625-.48.436-1.246.784-2.446 1.305-1.855.812-4.865 1.328-7.66 1.31-1.001-.022-1.968-.133-2.817-.232-1.743-.197-3.161-.357-4.026.269A12 12 0 0 0 10.724 24a12 12 0 0 0 12-12 12 12 0 0 0-12-12zM13.4 6.963a3.503 3.503 0 0 0-2.521.942 3.498 3.498 0 0 0-1.114 2.449 3.528 3.528 0 0 0 3.39 3.64 3.48 3.48 0 0 0 2.524-.946 3.504 3.504 0 0 0 1.114-2.446 3.527 3.527 0 0 0-3.393-3.64zm-.03 1.035a2.458 2.458 0 0 1 2.368 2.539 2.43 2.43 0 0 1-.774 1.706 2.456 2.456 0 0 1-1.762.659 2.461 2.461 0 0 1-2.364-2.542c.02-.655.3-1.26.777-1.707a2.419 2.419 0 0 1 1.756-.655zm.402 1.23c-.602 0-1.087.325-1.087.727 0 .4.485.725 1.087.725.6 0 1.088-.326 1.088-.725 0-.402-.487-.726-1.088-.726Z"/></svg>`;
  // Linux Mint — SimpleIcons official path (87CF3E)
  if (s === "linuxmint")
    return `<svg ${d} fill="#87CF3E"><path d="M5.438 5.906v8.438c0 2.06 1.69 3.75 3.75 3.75h5.625c2.06 0 3.75-1.69 3.75-3.75V9.656a2.827 2.827 0 0 0-2.813-2.812 2.8 2.8 0 0 0-1.875.737A2.8 2.8 0 0 0 12 6.844a2.827 2.827 0 0 0-2.812 2.812v4.688h1.875V9.656c0-.529.408-.937.937-.937s.938.408.938.937v4.688h1.875V9.656c0-.529.408-.937.937-.937s.938.408.938.937v4.688a1.86 1.86 0 0 1-1.875 1.875H9.188a1.86 1.86 0 0 1-1.875-1.875V5.906ZM12 0C5.384 0 0 5.384 0 12s5.384 12 12 12 12-5.384 12-12S18.616 0 12 0m0 1.875A10.11 10.11 0 0 1 22.125 12 10.11 10.11 0 0 1 12 22.125 10.11 10.11 0 0 1 1.875 12 10.11 10.11 0 0 1 12 1.875"/></svg>`;
  // macOS — SimpleIcons official Apple path
  if (s === "darwin" || s === "macos")
    return `<svg ${d} fill="#aaa"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>`;
  // Telnet — double wave
  if (s === "telnet")
    return `<svg ${d}><path d="M2 8c2.5-3.5 5.5-3.5 8 0s5.5 3.5 8 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M2 16c2.5-3.5 5.5-3.5 8 0s5.5 3.5 8 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  // Generic terminal prompt
  return `<svg ${d}><polyline points="4 8 9 12 4 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="16" x2="20" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function getCachedOsInfo(connId: string, protocol: string): string {
  // RDP always means Windows — no detection needed
  if (protocol === "rdp-cf" || protocol === "rdp") return "windows";
  const cache = currentSettings?.osCache;
  if (!cache) return "unknown";
  const entry = cache[connId];
  if (!entry) return "unknown";
  const durationMs = (currentSettings?.osCacheDurationHours ?? 6) * 3_600_000;
  if (Date.now() - entry.cachedAt > durationMs) return "unknown"; // expired
  return entry.osInfo;
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
  if (barActions.hasChildNodes()) tabBar.appendChild(barActions);

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
  const cachedOs = getCachedOsInfo(conn.id, conn.protocol);
  const connIcon =
    cachedOs !== "unknown"
      ? getOsIcon(cachedOs, 16)
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
  const item = document.createElement("div");
  const isManaged = !!conn.managed;
  item.className = `tunnel-item ${status}${selectedId === conn.id && !settingsView ? " active" : ""}${isPinned && !isManaged ? " pinned" : ""}${isManaged ? " managed" : ""}`;
  item.dataset.id = conn.id;
  const groupSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
  const managedBadgeSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.6" data-tooltip="Managed by your organization"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  item.innerHTML = `
    <div class="tunnel-icon">
      ${connIcon}
      <span class="tunnel-status-dot"></span>
    </div>
    <div class="tunnel-item-info">
      <div class="tunnel-item-name">${escapeHtml(conn.friendlyName || conn.hostname)}</div>
      <div class="tunnel-item-host">${escapeHtml(conn.hostname)}</div>
    </div>
    ${
      isManaged
        ? `<span class="managed-badge" data-tooltip="Managed by your organization">${managedBadgeSvg}</span>`
        : `<button class="group-btn${conn.group ? " has-group" : ""}" data-tooltip="${conn.group ? "Group: " + escapeHtml(conn.group) : "Set group"}">${groupSvg}</button>
         <button class="pin-btn" data-tooltip="${isPinned ? "Unpin" : "Pin"}">${isPinned ? "★" : "☆"}</button>`
    }
  `;
  item.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".pin-btn, .group-btn")) return;
    if (selectedId !== conn.id || settingsView) {
      debugMode = false;
      stopDebugPoll();
    }
    settingsView = false;
    selectedId = conn.id;
    renderSidebar();
    renderDetail();
  });

  if (!isManaged) {
    const pinBtn = item.querySelector<HTMLButtonElement>(".pin-btn")!;
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void togglePin(conn.id);
    });

    const groupBtn = item.querySelector<HTMLButtonElement>(".group-btn")!;
    groupBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showGroupPicker(groupBtn, conn);
    });

    makeSidebarItemDraggable(item, conn.id);

    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showDropdownMenu(e.clientX, e.clientY, [
        {
          label: isPinned ? "Unpin" : "Pin to top",
          action: () => void togglePin(conn.id),
        },
        ...(conn.group ? [{ title: conn.group } as MenuEntry] : []),
        {
          label: conn.group ? "Change group…" : "Set group…",
          action: () => showGroupPicker(groupBtn!, conn),
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
          danger: true,
          action: () => void handleAction("delete", conn.id),
        },
      ]);
    });
  } else {
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showDropdownMenu(e.clientX, e.clientY, [
        { title: "Managed by organization" } as MenuEntry,
        { separator: true },
        { label: "Connect", action: () => void handleAction("connect", conn.id) },
      ]);
    });
  }

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

function showGroupPicker(anchor: HTMLElement, conn: Connection): void {
  const existing = document.getElementById("_td-group-picker");
  if (existing) {
    existing.remove();
    return;
  }

  const otherGroups = [
    ...new Set(
      connections.filter((c) => c.group && c.id !== conn.id).map((c) => c.group),
    ),
  ].sort();

  const picker = document.createElement("div");
  picker.id = "_td-group-picker";
  picker.className = "group-picker";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "group-picker-input";
  input.value = conn.group || "";
  input.placeholder = "Group name…";
  picker.appendChild(input);

  if (otherGroups.length) {
    const list = document.createElement("div");
    list.className = "group-picker-list";
    for (const g of otherGroups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "group-picker-item" + (conn.group === g ? " active" : "");
      btn.textContent = g;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        dismiss();
        void assignGroup(conn, g);
      });
      list.appendChild(btn);
    }
    picker.appendChild(list);
  }

  if (conn.group) {
    const sep = document.createElement("div");
    sep.className = "group-picker-sep";
    picker.appendChild(sep);
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "group-picker-clear";
    clearBtn.textContent = "Remove from group";
    clearBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dismiss();
      void assignGroup(conn, "");
    });
    picker.appendChild(clearBtn);
  }

  document.body.appendChild(picker);

  const r = anchor.getBoundingClientRect();
  picker.style.left = `${r.left}px`;
  picker.style.top = `${r.bottom + 4}px`;
  requestAnimationFrame(() => {
    const pr = picker.getBoundingClientRect();
    if (pr.right > window.innerWidth)
      picker.style.left = `${window.innerWidth - pr.width - 8}px`;
    if (pr.bottom > window.innerHeight) picker.style.top = `${r.top - pr.height - 4}px`;
  });

  const dismiss = () => {
    if (document.body.contains(picker)) document.body.removeChild(picker);
    document.removeEventListener("mousedown", onOut);
  };

  const save = () => {
    const v = input.value.trim();
    dismiss();
    if (v !== (conn.group || "")) void assignGroup(conn, v);
  };

  const onOut = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) save();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
    }
  });

  setTimeout(() => {
    input.focus();
    input.select();
    document.addEventListener("mousedown", onOut);
  }, 0);
}

async function assignGroup(conn: Connection, group: string): Promise<void> {
  try {
    await window.api.saveConnection({
      id: conn.id,
      friendlyName: conn.friendlyName,
      hostname: conn.hostname,
      port: conn.port,
      protocol: conn.protocol,
      username: conn.username,
      group,
      notes: conn.notes,
      sshKeyPath: conn.sshKeyPath,
      jumpHost: conn.jumpHost,
      jumpPort: conn.jumpPort,
      keepExistingPassword: true,
      keepExistingSshKeyPassphrase: true,
    });
    await refreshConnections();
    renderSidebar();
    if (selectedId === conn.id) renderDetail();
  } catch {
    showToast("Could not update group.", "error");
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
    ? `<button class="cmd-btn" data-action="test-http" data-id="${conn.id}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Test</button>`
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
        <span class="prop-value">${protocolLabelHtml(proto)}</span>
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
      <div class="detail-empty-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
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

// ─── Policy Banner ────────────────────────────────────────────────────────────

function applyPolicyBanner(policy: PolicyState) {
  const banner = document.getElementById("policy-banner");
  const text = document.getElementById("policy-banner-text");
  if (!banner || !text) return;
  if (policy.bannerMessage) {
    text.textContent = policy.bannerMessage;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function renderSettingsPanel() {
  const s = currentSettings;
  if (!s) {
    detailPanel.innerHTML = `<div class="detail-empty"><div class="detail-empty-sub">Loading settings…</div></div>`;
    return;
  }

  const policy = currentPolicy;
  const auth = currentAuthStatus;
  const clientIdLocked = !!policy.clientId;
  const tenantIdLocked = !!policy.tenantId;
  const syncUrlLocked = !!policy.configSyncUrl;

  // Build policy restrictions text for the Enterprise section.
  const policyItems: string[] = [];
  if (policy.enforceSSO) policyItems.push("SSO enforced — sign-in required to connect");
  if (clientIdLocked) policyItems.push("Client ID locked by administrator");
  if (tenantIdLocked) policyItems.push("Tenant ID locked by administrator");
  if (syncUrlLocked) policyItems.push("Config sync URL locked by administrator");
  if (policy.disableManualConnections)
    policyItems.push("Adding manual connections disabled");
  if (policy.allowedProtocols?.length) {
    policyItems.push(`Allowed protocols: ${policy.allowedProtocols.join(", ")}`);
  }

  const effectiveClientId = policy.clientId || s.entraClientId || "";
  const effectiveTenantId = policy.tenantId || s.entraTenantId || "common";
  const effectiveSyncUrl = policy.configSyncUrl || s.configSyncUrl || "";

  const userInitials = auth.user
    ? auth.user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";

  detailPanel.innerHTML = `
    <div class="settings-panel">
      <div class="detail-header" style="margin-bottom:20px">
        <div class="detail-title-row">
          <h1 class="detail-title">Settings</h1>
        </div>
      </div>

      <div class="prop-section-label">Account</div>
      <div class="settings-list">
        <div class="settings-row settings-row--col">
          <div class="settings-row-label">
            <span class="settings-label">Azure App Registration</span>
            <span class="settings-desc">Enter the Client ID and Tenant ID from your Azure App Registration. The app must be a public client with redirect URI <code>http://localhost</code>.</span>
          </div>
          <div class="auth-fields-row" style="margin-top:8px">
            <input class="form-input" type="text" id="s-entra-client-id"
              placeholder="Client ID (GUID)"
              value="${escapeHtml(effectiveClientId)}"
              ${clientIdLocked ? "disabled" : ""}
              autocomplete="off" spellcheck="false" />
            <input class="form-input" type="text" id="s-entra-tenant-id"
              placeholder="Tenant ID or 'common'"
              value="${escapeHtml(effectiveTenantId)}"
              ${tenantIdLocked ? "disabled" : ""}
              autocomplete="off" spellcheck="false" />
          </div>
          ${clientIdLocked || tenantIdLocked ? `<div class="policy-lock-note"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Some fields are locked by your organization's policy.</div>` : ""}
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Microsoft account</span>
            <span class="settings-desc">Sign in to enable organization features. Requires Client ID above.</span>
          </div>
          ${
            auth.signedIn && auth.user
              ? `<div class="auth-user-card">
                <div class="auth-avatar">${userInitials}</div>
                <div class="auth-user-info">
                  <div class="auth-user-name">${escapeHtml(auth.user.name)}</div>
                  <div class="auth-user-email">${escapeHtml(auth.user.email)}</div>
                </div>
                <button class="btn btn-ghost btn-sm" id="s-sign-out">Sign out</button>
              </div>`
              : `<button class="btn btn-secondary btn-sm" id="s-sign-in" ${!effectiveClientId ? "disabled" : ""}>Sign in with Microsoft</button>`
          }
        </div>
      </div>

      <div class="prop-section-label" style="margin-top:22px">Organization</div>
      <div class="settings-list">
        <div class="settings-row settings-row--col">
          <div class="settings-row-label">
            <span class="settings-label">Config sync URL</span>
            <span class="settings-desc">HTTPS URL to a <code>tunneldesk-policy.json</code> file published by your admin (Azure Blob, SharePoint CDN, or any static HTTPS host).</span>
          </div>
          <input class="form-input" type="text" id="s-sync-url"
            placeholder="https://company.blob.core.windows.net/config/tunneldesk-policy.json"
            value="${escapeHtml(effectiveSyncUrl)}"
            ${syncUrlLocked ? "disabled" : ""}
            style="margin-top:8px"
            autocomplete="off" spellcheck="false" />
          ${syncUrlLocked ? `<div class="policy-lock-note"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Locked by policy.</div>` : ""}
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <span class="settings-label">Sync interval</span>
            <span class="settings-desc">How often to re-fetch the policy file.</span>
          </div>
          <select class="form-input settings-select" id="s-sync-interval">
            <option value="60" ${(s.configSyncInterval ?? 300) === 60 ? "selected" : ""}>1 minute</option>
            <option value="300" ${(s.configSyncInterval ?? 300) === 300 ? "selected" : ""}>5 minutes (default)</option>
            <option value="900" ${s.configSyncInterval === 900 ? "selected" : ""}>15 minutes</option>
            <option value="1800" ${s.configSyncInterval === 1800 ? "selected" : ""}>30 minutes</option>
            <option value="3600" ${s.configSyncInterval === 3600 ? "selected" : ""}>1 hour</option>
          </select>
        </div>
        <div class="settings-row" id="s-sync-status-row">
          <div class="settings-row-label">
            <span class="settings-label">Sync status</span>
            <span class="settings-desc" id="s-sync-status-text">Loading…</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-sync-now" ${!effectiveSyncUrl ? "disabled" : ""}>Sync Now</button>
        </div>
      </div>

      ${
        policyItems.length > 0
          ? `
      <div class="prop-section-label" style="margin-top:22px">Enterprise Policy</div>
      <div class="settings-list">
        <div class="policy-restrictions-box">
          ${policyItems.map((item) => `<div class="policy-restriction-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${escapeHtml(item)}</div>`).join("")}
        </div>
      </div>`
          : ""
      }

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
            <span class="settings-label">OS icon cache duration</span>
            <span class="settings-desc">How long to remember the detected OS/distro icon per connection.</span>
          </div>
          <select class="form-input settings-select" id="s-os-cache">
            <option value="1" ${(s.osCacheDurationHours ?? 6) === 1 ? "selected" : ""}>1 hour</option>
            <option value="6" ${(s.osCacheDurationHours ?? 6) === 6 ? "selected" : ""}>6 hours (default)</option>
            <option value="24" ${s.osCacheDurationHours === 24 ? "selected" : ""}>24 hours</option>
            <option value="168" ${s.osCacheDurationHours === 168 ? "selected" : ""}>1 week</option>
          </select>
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
            <input class="form-input" type="text" id="s-cf-path" placeholder="${window.api.platform === "win32" ? "e.g. C:\\tools\\cloudflared.exe" : window.api.platform === "darwin" ? "e.g. /usr/local/bin/cloudflared" : "e.g. /usr/local/bin/cloudflared"}" value="${escapeHtml(s.cloudflaredPath)}" autocomplete="off" />
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
            <input class="form-input" type="text" id="s-sftp-dl" placeholder="e.g. ${window.api.platform === "win32" ? "C:\\Users\\You\\Downloads" : "~/Downloads"}" value="${escapeHtml(s.sftpDownloadFolder)}" autocomplete="off" spellcheck="false" />
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

  initCustomSelects(detailPanel);

  // ── Sync status display ──────────────────────────────────────────────────
  const syncStatusText = document.getElementById("s-sync-status-text") as HTMLElement;
  void window.api
    .getSyncStatus()
    .then((st) => {
      if (!syncStatusText) return;
      if (st.lastSyncError) {
        syncStatusText.textContent = `Error: ${st.lastSyncError}`;
        syncStatusText.style.color = "var(--error)";
      } else if (st.lastSyncTime) {
        const ago = Math.round((Date.now() - st.lastSyncTime) / 1000);
        const fmtAgo =
          ago < 60
            ? `${ago}s ago`
            : ago < 3600
              ? `${Math.round(ago / 60)}m ago`
              : `${Math.round(ago / 3600)}h ago`;
        syncStatusText.textContent = `Last synced ${fmtAgo} — ${st.count} managed connection${st.count !== 1 ? "s" : ""}`;
      } else {
        syncStatusText.textContent = effectiveSyncUrl
          ? "Not yet synced"
          : "No sync URL configured";
      }
    })
    .catch(() => {});

  // ── Sync Now ─────────────────────────────────────────────────────────────
  document.getElementById("s-sync-now")?.addEventListener("click", async () => {
    const btn = document.getElementById("s-sync-now") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Syncing…";
    try {
      const res = await window.api.syncFetchNow();
      showToast(
        `Synced — ${res.count} connection${res.count !== 1 ? "s" : ""} pulled.`,
        "success",
      );
      if (syncStatusText)
        syncStatusText.textContent = `Just synced — ${res.count} managed connection${res.count !== 1 ? "s" : ""}`;
    } catch (err) {
      showToast(errorMsg(err, "Sync failed."), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sync Now";
    }
  });

  // ── Sign in ──────────────────────────────────────────────────────────────
  document.getElementById("s-sign-in")?.addEventListener("click", async () => {
    const btn = document.getElementById("s-sign-in") as HTMLButtonElement;
    const cid = (
      document.getElementById("s-entra-client-id") as HTMLInputElement
    )?.value.trim();
    const tid =
      (document.getElementById("s-entra-tenant-id") as HTMLInputElement)?.value.trim() ||
      "common";
    if (!cid) {
      showToast("Enter a Client ID first.", "error");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Opening sign-in…";
    try {
      // Save IDs before triggering the auth window.
      await window.api.saveSettings({ entraClientId: cid, entraTenantId: tid });
      const user = await window.api.authSignIn(cid, tid);
      currentAuthStatus = { signedIn: true, user };
      showToast(`Signed in as ${user.name}`, "success");
      renderSettingsPanel();
    } catch (err) {
      showToast(errorMsg(err, "Sign-in failed."), "error");
      btn.disabled = false;
      btn.textContent = "Sign in with Microsoft";
    }
  });

  // ── Sign out ─────────────────────────────────────────────────────────────
  document.getElementById("s-sign-out")?.addEventListener("click", async () => {
    await window.api.authSignOut();
    currentAuthStatus = { signedIn: false, user: null };
    showToast("Signed out.", "success");
    renderSettingsPanel();
  });

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
    const osCacheDurationHours =
      Number((document.getElementById("s-os-cache") as HTMLSelectElement)?.value) || 6;
    const entraClientId = clientIdLocked
      ? effectiveClientId
      : ((
          document.getElementById("s-entra-client-id") as HTMLInputElement
        )?.value.trim() ?? "");
    const entraTenantId = tenantIdLocked
      ? effectiveTenantId
      : (
          document.getElementById("s-entra-tenant-id") as HTMLInputElement
        )?.value.trim() || "common";
    const configSyncUrl = syncUrlLocked
      ? effectiveSyncUrl
      : ((document.getElementById("s-sync-url") as HTMLInputElement)?.value.trim() ?? "");
    const configSyncInterval =
      Number((document.getElementById("s-sync-interval") as HTMLSelectElement)?.value) ||
      300;
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
        osCacheDurationHours,
        entraClientId,
        entraTenantId,
        configSyncUrl,
        configSyncInterval,
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
  return window.api.openConfirmWindow(message);
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
  refreshCustomSelect(protocolInput);
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
    void window.api.openQcWindow();
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
    let userConns = await window.api.loadConnections();
    // Apply custom order if set, hide temp connections from sidebar
    const order = currentSettings?.connectionOrder ?? [];
    if (order.length > 0) {
      userConns = userConns.sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
    managedConnections = await window.api.getManagedConnections();
    // Merge: user connections first, then managed (dedup by id).
    const userIds = new Set(userConns.map((c) => c.id));
    connections = [...userConns, ...managedConnections.filter((m) => !userIds.has(m.id))];
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

if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW && !IS_QC_WINDOW && !IS_CONFIRM_WINDOW) {
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

if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW && !IS_QC_WINDOW && !IS_CONFIRM_WINDOW) {
  window.api.onConnectionSaved(async () => {
    await refreshConnections();
  });
}

// Keep currentSettings in sync across all windows (e.g. osCache saved from terminal window).
window.api.onSettingsDidChange((settings) => {
  currentSettings = settings;
  if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW && !IS_QC_WINDOW && !IS_CONFIRM_WINDOW) {
    renderSidebar();
  }
});

if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW && !IS_QC_WINDOW && !IS_CONFIRM_WINDOW) {
  window.api.onManagedConnectionsUpdated(({ connections: managed }) => {
    managedConnections = managed;
    const userIds = new Set(connections.filter((c) => !c.managed).map((c) => c.id));
    connections = [
      ...connections.filter((c) => !c.managed),
      ...managed.filter((m) => !userIds.has(m.id)),
    ];
    renderSidebar();
    renderDetail();
  });

  window.api.onPolicyUpdated((policy) => {
    currentPolicy = policy;
    applyPolicyBanner(policy);
    renderSidebar();
    if (settingsView) renderSettingsPanel();
  });
}

if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW && !IS_QC_WINDOW && !IS_CONFIRM_WINDOW) {
  const updateBanner = document.getElementById("update-banner") as HTMLElement;
  const updateBannerText = document.getElementById("update-banner-text") as HTMLElement;
  const updateBannerLink = document.getElementById(
    "update-banner-link",
  ) as HTMLAnchorElement;
  const updateBannerDismiss = document.getElementById(
    "update-banner-dismiss",
  ) as HTMLButtonElement;

  window.api.onUpdateAvailable(({ version, url }) => {
    updateBannerText.textContent = `TunnelDesk v${version} is available —`;
    updateBannerLink.href = url;
    updateBannerLink.addEventListener("click", (e) => {
      e.preventDefault();
      void window.api.openExternal(url);
    });
    updateBanner.classList.remove("hidden");
  });

  updateBannerDismiss.addEventListener("click", () => {
    updateBanner.classList.add("hidden");
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

  const platform = window.api.platform;
  const rdpClientName = deps.rdpClient ?? (platform === "win32" ? "mstsc" : "xfreerdp");
  let rdpLabel: string;
  if (platform === "win32") {
    rdpLabel = "mstsc (Remote Desktop)";
  } else if (platform === "darwin") {
    rdpLabel = `${rdpClientName} — install Microsoft Remote Desktop from the App Store (free)`;
  } else {
    rdpLabel = `${rdpClientName} — install with: sudo apt install freerdp2-x11`;
  }
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

window.api.onSshOsDetected(async ({ sid, osInfo }) => {
  const loc = sidToTab.get(sid);
  if (!loc || !osInfo || osInfo === "unknown") return;
  const st = termState.get(loc.connId);
  if (st) st.osInfo = osInfo;
  // Persist to cache and refresh sidebar icon
  const nowMs = Date.now();
  const osCache = {
    ...(currentSettings?.osCache ?? {}),
    [loc.connId]: { osInfo, cachedAt: nowMs },
  };
  try {
    currentSettings = await window.api.saveSettings({ osCache });
    renderSidebar();
  } catch {}
});

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

// ─── Confirm window initializer ──────────────────────────────────────────────

async function initConfirmWindow(): Promise<void> {
  (document.querySelector(".app") as HTMLElement).style.display = "none";
  const root = document.getElementById("form-window-root") as HTMLElement;
  root.classList.remove("hidden");
  root.style.overflow = "hidden";

  const modalCard = document.querySelector("#confirm-modal .modal") as HTMLElement;
  root.appendChild(modalCard);

  const msgEl = document.getElementById("confirm-message");
  if (msgEl) msgEl.textContent = CONFIRM_MESSAGE;

  document.getElementById("confirm-ok")?.addEventListener("click", () => {
    void window.api.confirmResult(true);
  });
  document.getElementById("confirm-cancel")?.addEventListener("click", () => {
    void window.api.confirmResult(false);
  });

  try {
    currentSettings = await window.api.getSettings();
  } catch {}
  applyTheme(currentSettings?.theme ?? "dark");
}

// ─── Quick Connect window initializer ────────────────────────────────────────

async function initQcWindow(): Promise<void> {
  (document.querySelector(".app") as HTMLElement).style.display = "none";
  const root = document.getElementById("form-window-root") as HTMLElement;
  root.classList.remove("hidden");

  const modalCard = document.querySelector("#quick-connect-modal .modal") as HTMLElement;
  modalCard.style.maxWidth = "";
  root.appendChild(modalCard);

  try {
    currentSettings = await window.api.getSettings();
  } catch {}
  applyTheme(currentSettings?.theme ?? "dark");
  initCustomSelects(root);
  setTimeout(() => qcHost?.focus(), 50);
}

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
        refreshCustomSelect(protocolInput);
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

if (!IS_TERMINAL_WINDOW && !IS_FORM_WINDOW && !IS_QC_WINDOW && !IS_CONFIRM_WINDOW) {
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
  const closeQc = () => {
    if (IS_QC_WINDOW) {
      window.close();
      return;
    }
    quickConnectModal.classList.remove("open");
    setTimeout(() => quickConnectModal.classList.add("hidden"), 160);
  };

  if (!IS_QC_WINDOW) {
    document.getElementById("quick-connect")?.addEventListener("click", () => {
      void window.api.openQcWindow();
    });
    quickConnectModal.addEventListener("click", (e) => {
      if (e.target === quickConnectModal) closeQc();
    });
  }
  document.getElementById("qc-cancel")?.addEventListener("click", closeQc);
  document.getElementById("qc-cancel-top")?.addEventListener("click", closeQc);

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
    if (!IS_QC_WINDOW) closeQc();
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
      await handleAction("connect", saved.id);
      if (IS_QC_WINDOW) {
        window.close();
      } else {
        await refreshConnections();
        selectedId = saved.id;
        renderSidebar();
        renderDetail();
      }
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

  // Load policy and auth state in background; UI handles missing gracefully.
  void window.api
    .getPolicy()
    .then((p) => {
      currentPolicy = p;
      applyPolicyBanner(p);
    })
    .catch(() => {});
  void window.api
    .authGetStatus()
    .then((s) => {
      currentAuthStatus = s;
    })
    .catch(() => {});

  await refreshConnections();
  // Clean up any leftover temp connections from a previous crash
  void window.api.deleteTempConnections();
}

initCustomSelects();

if (TERM_WIN_CONN_ID) {
  void initTerminalWindow(TERM_WIN_CONN_ID);
} else if (IS_FORM_WINDOW) {
  void initFormWindow(FORM_WIN_CONN_ID);
} else if (IS_QC_WINDOW) {
  void initQcWindow();
} else if (IS_CONFIRM_WINDOW) {
  void initConfirmWindow();
} else {
  init();
}
