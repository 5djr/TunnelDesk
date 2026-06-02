# TunnelDesk

> Cloudflare Zero Trust connection manager for Windows, Linux, and macOS

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/5djr/TunnelDesk/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)](#platform-support)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

TunnelDesk is a desktop application that lets you manage Cloudflare Access tunnels, direct SSH, RDP, Telnet, and HTTP connections from a single interface. Credentials are encrypted at rest with the platform keychain. Enterprise deployments support Entra ID sign-in, Group Policy, and org config sync.

> **Disclaimer:** TunnelDesk is an independent, open-source project and is not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. "Cloudflare", "Cloudflare Zero Trust", and "Cloudflare Access" are trademarks of Cloudflare, Inc.

---

<!-- Screenshots go here. Suggested: sidebar overview, terminal session, RDP via tunnel, settings page -->

---

## Features

### Connection types

- **Cloudflare Access tunnels** — RDP, SSH, Telnet, and HTTP/HTTPS connections routed through Cloudflare Zero Trust via `cloudflared`. No VPN, no open firewall ports.
- **Direct connections** — SSH, RDP, and Telnet without a tunnel when you are already on the right network.
- **HTTP/HTTPS** — open in your default browser from the connection sidebar.

### Terminal

- Embedded terminal powered by [xterm.js](https://xtermjs.org/) with a Windows Terminal-style tab bar.
- OS and Linux distro icons per tab, detected live from the remote host.
- Search, resize, and full UTF-8 support including box-drawing characters.
- SFTP file browser for SSH sessions — browse, upload, download, rename, delete.
- SSH key authentication with optional passphrase; jump host / bastion support.

### Connection management

- Connection groups and pinning for organizing large inventories.
- Auto-reconnect on disconnect (configurable retry count).
- Quick Connect for one-off sessions not saved to the permanent list (`Ctrl+Shift+O`).
- Org-managed connections (read-only, lock badge) pushed from an admin sync endpoint.
- Export / import connections as JSON.

### Security

- All credentials encrypted at rest with DPAPI via Electron `safeStorage` (machine-bound, platform keychain on macOS and Linux).
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every window.
- Input sanitized before storage; passwords never sent to the renderer process.

### Enterprise (v0.2.3)

- **Entra ID / Azure AD sign-in** — MSAL v5 PKCE OAuth2 flow (Settings → Account).
- **Org config sync** — pull a managed connection list from any HTTPS endpoint (Settings → Organization).
- **Group Policy** — enforce settings via Windows registry keys or a Linux JSON file.
- Policy banner and locked fields in the UI when settings are managed by your organization.

---

## Platform support

| Platform                                    | Installer formats | Architecture                       |
| ------------------------------------------- | ----------------- | ---------------------------------- |
| Windows 10 / 11                             | MSI, portable EXE | x64                                |
| Linux (Ubuntu 20.04+, Debian, Fedora, etc.) | AppImage, .deb    | x64, arm64                         |
| macOS 12+ (Monterey)                        | DMG, ZIP          | x64 (Intel), arm64 (Apple Silicon) |

---

## Requirements

### All platforms

- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) — required for any Cloudflare Access tunnelled connection. Must be on `PATH` or set a custom path in Settings.

### Windows

- **RDP** — `mstsc.exe` is included in every Windows installation. No extra steps needed.
- **SSH** — the built-in OpenSSH client shipped with Windows 10/11. Enable it under Settings → Optional Features if missing.

### Linux

- **RDP** — [FreeRDP](https://www.freerdp.com/): `sudo apt install freerdp2-x11` (or `freerdp3-x11` on newer systems).
- **SSH/Telnet** — embedded via ssh2 / net.Socket (no external client needed).

### macOS

- **RDP** — [Microsoft Remote Desktop](https://apps.apple.com/app/microsoft-remote-desktop/id1295203466) from the Mac App Store (free). TunnelDesk generates and opens a `.rdp` file automatically.
- **SSH** — `Terminal.app` is launched via `ssh://` URL. No extra installation needed.

---

## Installation

### Download a release

1. Go to the [Releases](https://github.com/5djr/TunnelDesk/releases) page.
2. Download the installer for your platform.
3. Run the installer.
4. On first launch, install `cloudflared` and optionally set its path in Settings if it isn't on `PATH`.

| Platform            | File                         | Notes                                            |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| Windows             | `TunnelDesk-x.x.x.msi`       | Standard installer, no admin required (per-user) |
| Windows             | `TunnelDesk-x.x.x.exe`       | Portable, no install needed                      |
| Linux x64           | `TunnelDesk-x.x.x.AppImage`  | `chmod +x` then run                              |
| Linux x64           | `tunneldesk_x.x.x_amd64.deb` | `sudo dpkg -i`                                   |
| macOS Intel         | `TunnelDesk-x.x.x.dmg`       | Drag to Applications                             |
| macOS Apple Silicon | `TunnelDesk-x.x.x-arm64.dmg` | Drag to Applications                             |

**macOS note:** Because the build is unsigned for community releases, you may need to right-click → Open the first time to bypass Gatekeeper.

---

## Enterprise Setup

### Entra ID / Azure AD sign-in

TunnelDesk uses MSAL v5 with a PKCE public-client flow. No client secret is required.

**App registration steps:**

1. In the [Azure portal](https://portal.azure.com), go to **Azure Active Directory → App registrations → New registration**.
2. Name: anything descriptive (e.g. `TunnelDesk`).
3. Supported account types: choose the appropriate tenant scope for your org.
4. Redirect URI: select **Public client / native (mobile & desktop)** and enter `http://localhost`.
5. Under **Authentication**, enable **Allow public client flows**.
6. Under **API permissions**, ensure `openid`, `profile`, `email`, and `offline_access` are present.
7. Copy the **Application (client) ID** and **Directory (tenant) ID**.

Enter these values in TunnelDesk under **Settings → Account**.

---

### Group Policy

**Windows** — registry path:

```
HKEY_LOCAL_MACHINE\SOFTWARE\Policies\TunnelDesk
```

**Linux** — file path:

```
/etc/tunneldesk/policy.json
```

**Supported keys:**

| Key                        | Windows type | Description                                           |
| -------------------------- | ------------ | ----------------------------------------------------- |
| `ConfigSyncUrl`            | `REG_SZ`     | HTTPS URL for org config sync endpoint                |
| `SyncInterval`             | `REG_DWORD`  | Sync poll interval in seconds (min 60)                |
| `TenantId`                 | `REG_SZ`     | Entra ID tenant ID (locks the field in Settings)      |
| `ClientId`                 | `REG_SZ`     | Entra ID client ID (locks the field in Settings)      |
| `EnforceSSO`               | `REG_DWORD`  | 1 = require sign-in                                   |
| `DisableManualConnections` | `REG_DWORD`  | 1 = prevent adding personal connections               |
| `BannerMessage`            | `REG_SZ`     | Text shown in the policy banner at the top of the app |
| `AllowedProtocols`         | `REG_SZ`     | Comma-separated list of allowed protocol identifiers  |

Policy values lock the corresponding UI fields and show a lock indicator.

---

### Org config sync

When `ConfigSyncUrl` is configured (via policy or Settings → Organization), TunnelDesk polls a JSON document and merges org-managed connections into the sidebar. These connections display a lock badge and cannot be edited or deleted.

**Policy JSON format:**

```json
{
  "version": 1,
  "syncInterval": 300,
  "managedConnections": [
    {
      "id": "prod-jump",
      "friendlyName": "Production Jump Host",
      "hostname": "ssh.prod.example.com",
      "port": 22,
      "username": "svc-deploy",
      "protocol": "ssh-cf",
      "group": "Production"
    }
  ],
  "policies": {
    "disableManualConnections": false,
    "bannerMessage": "Welcome to Acme Corp. All sessions are monitored.",
    "allowedProtocols": ["ssh-cf", "ssh", "rdp-cf", "rdp"]
  }
}
```

The endpoint must return `Content-Type: application/json` and be accessible over HTTPS. Publish to Azure Blob Storage, SharePoint CDN, or any static HTTPS host.

---

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- `npm` 10 or later
- `cloudflared` on `PATH` for runtime testing (not required to build)

### Steps

```bash
git clone https://github.com/5djr/TunnelDesk.git
cd TunnelDesk
npm install
```

**Development (live Electron window):**

```bash
npm run dev
```

Builds the renderer with Vite and launches Electron. Reload the renderer with `Ctrl+R`; restart the main process manually after main-process changes.

**Build renderer only:**

```bash
npm run build:renderer
# then npm start to launch against the built renderer
```

**Package installers:**

```bash
# Windows — MSI + portable EXE → dist-app/
npm run dist

# Linux — AppImage + .deb → dist-app/
npm run dist:linux

# macOS — DMG + ZIP (x64 + arm64) → dist-app/
npm run dist:mac
```

Cross-platform packaging (e.g. building macOS DMG from Windows) is not supported. Use the matching platform or the GitHub Actions CI workflow.

### CI / Automated releases

`.github/workflows/release.yml` triggers on any tag matching `v*`. It builds all three platforms in parallel on GitHub-hosted runners and uploads the artifacts to a GitHub Release automatically.

---

## Third-party software

| Package                                                                                | License    |
| -------------------------------------------------------------------------------------- | ---------- |
| [Electron](https://www.electronjs.org/)                                                | MIT        |
| [Vite](https://vitejs.dev/)                                                            | MIT        |
| [TypeScript](https://www.typescriptlang.org/)                                          | Apache 2.0 |
| [xterm.js](https://xtermjs.org/)                                                       | MIT        |
| [ssh2](https://github.com/mscdex/ssh2)                                                 | MIT        |
| [@azure/msal-node](https://github.com/AzureAD/microsoft-authentication-library-for-js) | MIT        |
| [electron-builder](https://www.electron.build/)                                        | MIT        |

TunnelDesk launches `cloudflared` as an external process. `cloudflared` is developed by Cloudflare, Inc. and is subject to its own [license](https://github.com/cloudflare/cloudflared/blob/master/LICENSE). TunnelDesk does not bundle or redistribute `cloudflared`.

---

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on setting up the dev environment, code style, and the PR process.

---

## Security

To report a vulnerability, **do not open a public issue** — email **hello@tym.wtf** instead. See [SECURITY.md](SECURITY.md) for the full policy.

---

## License

Copyright (c) 2026 5djr. Released under the [MIT License](LICENSE).
