# Contributing to TunnelDesk

Thanks for your interest in contributing. This document covers how to report issues, suggest features, and submit code changes.

## Reporting bugs

Open an issue using the **Bug report** template. Include:

- TunnelDesk version and platform (Windows / Linux / macOS)
- Steps to reproduce
- What you expected vs. what happened
- Any relevant logs (`userData/activity.log`)

## Suggesting features

Open an issue using the **Feature request** template. Describe the use case and why existing behavior doesn't cover it.

## Submitting a pull request

1. Fork the repository and create a branch off `main`.
2. Make your changes. Keep commits focused — one logical change per commit.
3. Run the TypeScript check and formatter before pushing:
   ```bash
   npx tsc --noEmit
   npx prettier --write .
   ```
4. Open a PR against `main`. Fill out the PR template.

PRs that introduce new IPC channels must wire them in both `src/preload.js` and `src/main/ipc.js`. See the [Architecture section](CLAUDE.md#architecture) for the process boundary rules.

## Development setup

```bash
git clone https://github.com/5djr/TunnelDesk.git
cd TunnelDesk
npm install
npm run dev
```

`npm run dev` builds the renderer with Vite and launches Electron. After a main-process change, quit and rerun `npm run dev`. After a renderer-only change, `Ctrl+R` in the Electron window is enough.

## Code style

- **Formatter**: Prettier (`.prettierrc` at the repo root). Run `npx prettier --write .` before committing.
- **Types**: TypeScript strict mode for the renderer (`src/renderer/src/`). Main-process files are plain JavaScript.
- **No test suite**: there are no automated tests. Manual smoke testing is required.
- **Comments**: only when the _why_ is non-obvious. Avoid restating what the code already says.

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
