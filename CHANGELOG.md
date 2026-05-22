# Changelog

All notable changes to TunnelDesk are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
