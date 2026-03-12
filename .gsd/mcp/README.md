# MCP Setup for Interdict

This directory provides MCP templates to keep agent prompts small while enabling live tool access.

## Files

- `servers.example.json`: checked-in baseline template
- `servers.local.json`: machine-local active config (do not commit)

## Quick Start

1. Copy template:
   - `cp .claude/mcp/servers.example.json .claude/mcp/servers.local.json`
2. Update paths and credentials for your machine.
3. Register the local config in your agent runtime.

## Recommended Servers

- Git server for branch/history/PR context
- Filesystem server for scoped workspace access
- Docker server for image and container operations
- Kubernetes server for cluster object inspection

## Optional Custom Servers

Add local adapters for `wasmtime` and cryptographic verification when needed
(for example, policy compilation checks and Ed25519/Merkle verification helpers).

Suggested names:

- `wasmtime` (policy runtime checks)
- `crypto` (libsodium/ed25519 verification helpers)

## Security Notes

- Do not store secrets in checked-in MCP configs.
- Keep local keys/certs in `.claude/mcp/` and rely on `.gitignore` protections.
- Scope filesystem server roots to least privilege.
