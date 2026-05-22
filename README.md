# TunnelDesk

A Windows Electron app for managing Cloudflare Zero Trust RDP connections.

## Features

- Save multiple RDP targets with hostname, friendly name, and local port
- Connect using `cloudflared access rdp --hostname ... --url rdp://localhost:<port>`
- Automatically launch Windows Remote Desktop (`mstsc`)
- Reuse active tunnels when available
- Disconnect and clean up cloudflared processes
- Simple local JSON storage for connections

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

3. Build the app (produces a Windows MSI installer in `dist-app/`):

```bash
npm run dist
```

## Requirements

- Windows 10 or 11
- `cloudflared` installed and available in `PATH`
- Remote Desktop client available (`mstsc`)

## Usage

1. Click **+ New Connection**.
2. Enter a friendly name, hostname, and optional local port.
3. Click **Save**.
4. Click **Connect**.
5. The app starts `cloudflared` silently and launches `mstsc /v:localhost:<port>`.

## Notes

- If `cloudflared` or `mstsc` is missing from `PATH`, a warning banner appears at startup. Download cloudflared from [developers.cloudflare.com](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
- The app stores connections in Electron's user data folder as `connections.json`.
- Active tunnels are reused when the same saved connection is connected again.
