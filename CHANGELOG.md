# Changelog

All notable changes to TunnelDesk are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.1.0] - 2024

### Added

- Cloudflare Zero Trust RDP connection manager
- Support for RDP, SSH, Telnet, HTTP, and HTTPS protocols
- Cloudflare Access authentication flow with browser auto-open
- DPAPI-backed credential encryption via Electron `safeStorage`
- One-time migration of plain-text passwords to encrypted storage
- Real-time tunnel stats panel (RTT, jitter, uptime, memory)
- Application-layer RTT measurement using TPKT/X.224 handshake for RDP
- Rolling 60-sample latency history with min/avg/max/jitter
- RDP reconnect button when the mstsc window is closed but tunnel stays alive
- Activity log with timestamps
- Dependency warning banner when cloudflared or mstsc is missing
- MSI installer via electron-builder
