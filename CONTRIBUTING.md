# Contributing

1. Fork the repository and create a focused branch.
2. Use Node.js 22.16+ and the pnpm version pinned in `package.json`.
3. Run `pnpm install --frozen-lockfile` and `pnpm verify` before opening a pull request.
4. UI changes must also pass the Visual Smoke workflow.

Never commit real IP addresses, private hostnames, API keys, Bark URLs, cookies, databases, backups, logs, screenshots, or device configuration. Fixtures must use `example.com` and documented test address ranges; use neutral names such as `Test Device`.

Core changes must preserve the security contracts in `AGENTS.md`: browser requests use the Core proxy, secrets decrypt only inside Core, writes fail closed on Origin checks, and proxy targets remain constrained to registered LAN devices.
