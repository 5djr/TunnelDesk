# Security Policy

## Supported versions

Only the latest release receives security fixes. Older versions are not patched.

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |
| Older   | No        |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Send a report to **hello@tym.wtf** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (if applicable)
- TunnelDesk version and platform

You can expect an acknowledgement within 48 hours. If a fix is needed, a patched release will be published and you will be credited in the changelog (unless you prefer to remain anonymous).

## Scope

Areas of particular interest:

- Credential storage and encryption (`src/main/crypto.js`)
- IPC channel exposure via the context bridge (`src/preload.js`)
- Path traversal or command injection in SSH/RDP/Telnet handling
- Entra ID OAuth2 token handling (`src/main/auth.js`)
- Org config sync and policy enforcement (`src/main/sync.js`, `src/main/policy.js`)

## Out of scope

- Vulnerabilities in `cloudflared`, `mstsc`, `xfreerdp`, or other external tools launched by TunnelDesk
- Issues that require physical access to the machine
- Social engineering
