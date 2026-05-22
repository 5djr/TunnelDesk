# Changelog

All notable changes to TunnelDesk are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
