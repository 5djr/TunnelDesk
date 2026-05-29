# Changelog

All notable changes to TunnelDesk are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.2.4] - 2026-05-29

### Fixed

- RDP window not appearing after connect — `storeCredential` was rewritten in v0.2.3 to use PowerShell for security, but PowerShell's startup overhead (500ms–2s per invocation) delayed `mstsc` from launching, making it appear as if RDP was broken. Reverted to direct `cmdkey` calls (< 100ms each). This fixes both RDP-via-Cloudflare and direct RDP on Windows.

## [0.2.3] - 2026-05-29

### Added

- **Microsoft Entra ID / Azure AD sign-in** — Settings → Account: enter your Azure App Registration Client ID + Tenant ID and sign in with Microsoft (MSAL v5, PKCE OAuth2, in-app browser, tokens stored DPAPI-encrypted)
- **Organization config sync** — Settings → Organization: point to any HTTPS endpoint hosting a `tunneldesk-policy.json`; clients poll it on a configurable interval and display org-managed connections in the sidebar with a lock badge (read-only, still connectable)
- **Group Policy enforcement** — Windows: `HKLM\SOFTWARE\Policies\TunnelDesk` registry keys; Linux: `/etc/tunneldesk/policy.json`. Keys: `ConfigSyncUrl`, `TenantId`, `ClientId`, `EnforceSSO`, `DisableManualConnections`, `SyncInterval`, `BannerMessage`, `AllowedProtocols`. Policy values override settings and lock the corresponding UI fields
- **Policy banner** — when `BannerMessage` is set by policy, a persistent banner appears at the top of the main panel
- **macOS support** — full RDP (`.rdp` file + Microsoft Remote Desktop from App Store), SSH (`ssh://` URL → Terminal.app, osascript fallback), and Telnet (`telnet://` URL) support; native macOS app menu (Cmd+C/V/Q/W/M); process memory tracking via `ps -p PID -o rss=`; Microsoft Remote Desktop detected in `/Applications/`
- **macOS builds** — DMG + ZIP (x64 and arm64) via `npm run dist:mac`; GitHub Actions CI workflow (`.github/workflows/release.yml`) builds all three platforms on every `v*` tag push

### Fixed

- RDP window not appearing on connect — `storeCredential` was rewritten to use PowerShell for security, but PowerShell startup overhead (500ms–2s per invocation) delayed mstsc launch noticeably; reverted to direct `cmdkey` calls which complete in under 100ms
- `sanitizePath` now rejects `../` sequences to prevent path traversal in SSH key paths
- Org-managed connections from config sync now go through the same `sanitizeHostname`, `normalizePort`, `sanitizeUsername` validation as user-defined connections
- Null-guard added to all `activeConnections.get()` re-checks after `await` calls in `rdp.js`

## [0.2.2] - 2026-05-29

### Added

- Update notification banner — on startup the app checks GitHub Releases for a newer version; if one is found, a dismissible blue banner appears at the top with a direct download link
- Live OS icon in sidebar — the detected OS/distro icon now appears immediately after SSH connects without requiring an app restart; all open windows are kept in sync via a settings broadcast

### Fixed

- Console window flash suppressed for all spawned Windows processes — `mstsc.exe` spawns now include `windowsHide: true`, consistent with every other background process
- Settings changes (e.g. OS cache updates) are broadcast to all windows so the main window's sidebar reflects them without a restart

## [0.1.4] - 2026-05-28

### Added

- Embedded Telnet terminal — replaced external telnet launcher with a full xterm.js terminal using Node.js `net.Socket` and RFC 854 IAC negotiation; reuses the same SSH terminal UI (tabs, reconnect, font zoom, copy/paste, right-click menu)
- IAC option negotiation: accepts ECHO and SGA; negotiates NAWS (window-size updates on resize) and TTYPE (`xterm-256color`); rejects all other options per RFC 854
- SSH key passphrase support — `encryptedSshKeyPassphrase` stored encrypted in `connections.json`; passphrase input shown in the connection form for SSH protocols
- SFTP file operations — right-click context menu on file rows with **Download**, **Rename**, and **Delete** actions; **New Folder** button in the SFTP toolbar
- Terminal reconnect button — when an SSH session closes, a "Reconnect" button is rendered in the closed tab
- Terminal font zoom — `Ctrl++`/`Ctrl+-` changes font size per tab; `Ctrl+0` resets to default; also available in the right-click context menu
- Terminal copy/paste shortcuts — `Ctrl+Shift+C` copies selection; `Ctrl+Shift+V` pastes clipboard to the stream
- Terminal right-click context menu — Copy / Paste / Zoom options
- SFTP right-click context menu — Download / Rename / Delete for selected file rows

### Fixed

- SSH direct connections now correctly report "Disconnected" when all terminal tabs are closed (was staying "Connected" indefinitely)
- Passphrase-related SSH errors now surface a friendly "SSH key is passphrase-protected" message instead of a raw authentication error
- SFTP "File Transfer" tab option hidden for Telnet connections (only shown for `ssh` and `ssh-cf` protocols)

## [0.1.3] - 2026-05-23

### Fixed

- Cloudflared path placeholder on Windows used a forward-slash separator — corrected to `C:\path\to\cloudflared.exe`
- Various Prettier formatting fixes across main-process files

## [0.1.2] - 2026-05-23

### Added

- Linux support — full cross-platform operation on Ubuntu, Kali, Debian, and compatible distros
- RDP via `xfreerdp3` (FreeRDP v3) with fallback to `xfreerdp` (v2) on Linux
- Linux terminal emulator auto-detection for SSH/Telnet (`x-terminal-emulator`, `gnome-terminal`, `konsole`, `qterminal`, `xfce4-terminal`, `lxterminal`, `xterm`)
- AppImage and `.deb` build targets for Linux (x64 and arm64) via `npm run dist:linux`

### Changed

- Platform-aware dependency warning in the UI — shows Linux-specific install instructions when running on Linux
- Tray icon uses `icon.ico` on Windows and `icon.png` on Linux

## [0.1.1] - 2026-05-22

### Added

- SSH/SFTP embedded terminal with tabbed interface — terminal and file transfer sessions in a dedicated window
- SSH direct (`ssh`) and SSH via Cloudflare (`ssh-cf`) protocol support with embedded xterm.js terminal
- SFTP file browser with modern icon-based column layout (Name / Size / Modified), hidden-file toggle, breadcrumb navigation, and double-click to navigate/download
- File-type icons for folders, symlinks, images, archives, code, config, text, PDF, and binary files
- Terminal windows open automatically on SSH connect — no extra click required

### Fixed

- SSH status stayed "Connecting" indefinitely when the terminal could not connect — status is now driven by the actual ssh2 session result
- Opening an SFTP tab that failed to connect incorrectly set the parent SSH connection status to "Disconnected", even when the terminal tab was still alive
- `Error invoking remote method '...': Error:` Electron IPC prefix stripped from all tab error messages
- `safeSend` only broadcast to the main window — terminal windows now receive all IPC events correctly
- SSH username fallback now uses `os.userInfo().username` when the connection has no username configured, preventing `Invalid username` errors
- Terminal window `onAuthRequired` event called `renderDetail()` which would overwrite the terminal content with the connection detail view
- SFTP/pick-file dialogs opened attached to the main window instead of the window that triggered them — dialogs now follow the correct parent window
- Disconnecting an SSH direct connection from the main window left active SSH sessions open in the background — sessions are now properly closed on disconnect
- Terminal window flashed white before content loaded — window now stays hidden until ready
- SFTP panel showed "Empty directory" briefly before the connection spinner appeared
- SFTP panel showed stale directory listing after the server closed the session — now shows "Session closed" state
- All scrollbars now match the dark theme (was white/default)

### Changed

- Terminal tabs redesigned with rounded top corners, Chrome-style active indicator, and hide-until-hover close button
- SFTP toolbar redesigned with icon buttons, breadcrumb path, and separate Upload/Download/Refresh actions

## [0.1.0] - 2026-05-22

### Added

- Cloudflare Zero Trust RDP/SSH connection manager for Windows
- Support for RDP, SSH, Telnet, HTTP, and HTTPS protocols (both via Cloudflare Access and direct)
- Cloudflare Access authentication flow with automatic browser launch
- System tray integration — hide to tray on close, right-click menu to connect/disconnect tunnels
- SSH key file authentication (`-i key.pem`) per connection
- Connection groups — collapsible sidebar sections for organizing tunnels
- Connection notes — free-text field per tunnel shown in the detail panel
- Copy endpoint button — copies `localhost:port` to clipboard when a tunnel is active
- Keyboard shortcuts — `Ctrl+N`, `Enter`, `Delete`, `Ctrl+D`, arrow key navigation
- Sidebar search — real-time filter by name, hostname, or group
- Settings panel — custom `cloudflared` path, minimize-to-tray, start minimized, default protocol, log retention
- Persistent activity log — rotating file log in `userData` (512 KB per file, 3 rotated copies)
- DPAPI-backed credential encryption via Electron `safeStorage`
- One-time migration of any plain-text passwords to encrypted storage
- Real-time debug panel — RTT, jitter, uptime, cloudflared and mstsc process memory
- Application-layer RTT measurement using TPKT/X.224 handshake for RDP
- Rolling 60-sample latency history with min/avg/max/jitter
- RDP reconnect button when the mstsc window is closed but the tunnel is still alive
- Onboarding empty state with 3-step setup guide
- Dependency warning banner when `cloudflared` or `mstsc` is missing
- MSI installer and portable exe via electron-builder
