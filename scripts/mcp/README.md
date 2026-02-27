# Interdict MCP Helper Servers

Custom stdio MCP servers used by project configs:

- `wasmtime_server.mjs`
- `crypto_server.mjs`

## Setup

```bash
npm install --prefix scripts/mcp
```

## Smoke Test

```bash
node scripts/mcp/wasmtime_server.mjs
node scripts/mcp/crypto_server.mjs
```

Both commands start an MCP server over stdio and wait for a client connection.
