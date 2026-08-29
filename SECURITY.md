# Security Policy

## Supported version

Security fixes are applied to the latest release and the `main` branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing credentials, private hostnames, database files, API keys, Bark endpoints, session cookies, or proof-of-concept data from a real network.

Include the affected version or commit, impact, reproduction steps using synthetic data, and a proposed mitigation when available. Remove secrets from screenshots and logs.

## Deployment boundary

Surge LAN Console is intended for a trusted LAN or controlled VPN. Keep the Compose loopback binding, terminate TLS at a trusted reverse proxy, initialize the data PIN before granting network access, and never expose the Core port directly to the public Internet.

A four-digit PIN limits casual access but is not a substitute for host filesystem permissions, encrypted storage, TLS, and network access control. Treat SQLite databases and backups as secret material.
