# TunnelDesk

A Windows desktop app for managing [Cloudflare Zero Trust](https://www.cloudflare.com/zero-trust/) RDP and SSH tunnel connections.

> **Disclaimer:** TunnelDesk is an independent, open-source project and is not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. "Cloudflare", "Cloudflare Zero Trust", and "Cloudflare Access" are trademarks of Cloudflare, Inc.

---

## Features

- **Update notifications** — a banner appears at the top when a newer version is available, with a direct download link
- **System tray** — runs in the background; right-click to connect or disconnect without opening the window
- **Multiple protocols** — RDP and SSH via Cloudflare Access, plus direct RDP, SSH, Telnet, HTTP, and HTTPS
- **Embedded terminal** — full xterm.js terminal with tabbed sessions for SSH and Telnet, no external client needed
- **OS/distro icon** — detects the remote OS after connecting and shows the distro icon in the sidebar (cached for 6 hours, updates live without restart)
- **SFTP file browser** — browse, download, upload, rename, delete, and create folders over SSH
- **SSH key authentication** — specify a `.pem` or `.ppk` key file and optional passphrase per connection
- **Jump host / bastion** — chain SSH connections through an intermediate bastion server
- **Connection groups** — organize tunnels into collapsible sidebar folders
- **Connection notes** — free-text notes per tunnel (e.g. "ask John for access")
- **Copy endpoint** — one-click copy of `localhost:port` when a tunnel is active
- **Keyboard shortcuts** — `Ctrl+N` new, `Enter` connect/disconnect, `Delete` delete, `Ctrl+D` debug panel
- **Sidebar search** — filter tunnels by name, hostname, or group
- **Quick Connect** — one-off SSH/Telnet session without saving a connection (`Ctrl+Shift+O`)
- **Persistent activity log** — rotating log file saved in AppData
- **Settings panel** — custom `cloudflared` path, startup behavior, log retention, OS icon cache duration
- **Debug panel** — live RTT, jitter, uptime, and process memory stats
- **Encrypted credentials** — passwords stored with Windows DPAPI via Electron `safeStorage`
- **Light / dark / system theme** — full theme support with a system-follows-OS option

---

## Requirements

- Windows 10 or 11 (x64)
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed and available in `PATH` (or set a custom path in Settings)
- Remote Desktop client (`mstsc`) — built into Windows, required for RDP connections

---

## Installation

Download the latest installer from the [Releases](https://github.com/5djr/TunnelDesk/releases) page:

| File                   | Type                                                |
| ---------------------- | --------------------------------------------------- |
| `TunnelDesk x.x.x.msi` | Standard installer — recommended, no admin required |
| `TunnelDesk x.x.x.exe` | Portable — runs without installing                  |

---

## Building from Source

```bash
# Install dependencies
npm install

# Run in development (builds renderer then launches Electron)
npm run dev

# Build the MSI + portable exe installer
npm run dist

# Build Linux AppImage + .deb
npm run dist:linux
```

Built artifacts are output to `dist-app/`.

---

## Third-Party Software

TunnelDesk is built on top of the following open-source projects:

| Package                                         | License    |
| ----------------------------------------------- | ---------- |
| [Electron](https://www.electronjs.org/)         | MIT        |
| [Vite](https://vitejs.dev/)                     | MIT        |
| [TypeScript](https://www.typescriptlang.org/)   | Apache 2.0 |
| [xterm.js](https://xtermjs.org/)                | MIT        |
| [ssh2](https://github.com/mscdex/ssh2)          | MIT        |
| [electron-builder](https://www.electron.build/) | MIT        |

TunnelDesk launches `cloudflared` as an external process. `cloudflared` is developed by Cloudflare, Inc. and is subject to its own [license](https://github.com/cloudflare/cloudflared/blob/master/LICENSE). TunnelDesk does not bundle or redistribute `cloudflared`.

---

## License

Copyright (c) 2026 5djr. Released under the [MIT License](LICENSE).

This software is provided **as is**, without warranty of any kind. See the [LICENSE](LICENSE) file for full terms.
