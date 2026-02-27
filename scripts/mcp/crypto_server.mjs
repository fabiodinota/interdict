#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sodium = require("libsodium-wrappers-sumo");

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "interdict-crypto-server",
  version: "0.1.0",
});

function statusPayload() {
  const major = typeof sodium.library_version_major === "function"
    ? sodium.library_version_major()
    : null;
  const minor = typeof sodium.library_version_minor === "function"
    ? sodium.library_version_minor()
    : null;

  return {
    ready: true,
    implementation: "libsodium-wrappers-sumo",
    version: major !== null && minor !== null ? `${major}.${minor}` : "unknown",
  };
}

server.registerTool(
  "libsodium_status",
  {
    title: "libsodium Status",
    description: "Check libsodium wrapper availability and version",
    inputSchema: {},
    outputSchema: {
      ready: z.boolean(),
      implementation: z.string(),
      version: z.string(),
    },
  },
  async () => {
    const result = statusPayload();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "sha256_text",
  {
    title: "SHA-256 Text",
    description: "Compute SHA-256 for input text using libsodium",
    inputSchema: {
      text: z.string().describe("Input text"),
    },
    outputSchema: {
      sha256Hex: z.string(),
    },
  },
  async ({ text }) => {
    const digest = sodium.crypto_hash_sha256(sodium.from_string(text));
    const result = {
      sha256Hex: sodium.to_hex(digest),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "ed25519_generate_keypair",
  {
    title: "Generate Ed25519 Keypair",
    description: "Generate an Ed25519 keypair (base64-encoded)",
    inputSchema: {},
    outputSchema: {
      publicKeyBase64: z.string(),
      secretKeyBase64: z.string(),
    },
  },
  async () => {
    const pair = sodium.crypto_sign_keypair();
    const variant = sodium.base64_variants.ORIGINAL;
    const result = {
      publicKeyBase64: sodium.to_base64(pair.publicKey, variant),
      secretKeyBase64: sodium.to_base64(pair.privateKey, variant),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "ed25519_sign",
  {
    title: "Sign with Ed25519",
    description: "Create detached Ed25519 signature for message text",
    inputSchema: {
      message: z.string().describe("Message to sign"),
      secretKeyBase64: z.string().describe("Ed25519 secret key (base64)"),
    },
    outputSchema: {
      signatureBase64: z.string(),
    },
  },
  async ({ message, secretKeyBase64 }) => {
    const variant = sodium.base64_variants.ORIGINAL;
    const secretKey = sodium.from_base64(secretKeyBase64, variant);
    const signature = sodium.crypto_sign_detached(
      sodium.from_string(message),
      secretKey,
    );

    const result = {
      signatureBase64: sodium.to_base64(signature, variant),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "ed25519_verify",
  {
    title: "Verify Ed25519 Signature",
    description: "Verify detached Ed25519 signature against message text",
    inputSchema: {
      message: z.string().describe("Original message"),
      signatureBase64: z.string().describe("Detached signature (base64)"),
      publicKeyBase64: z.string().describe("Ed25519 public key (base64)"),
    },
    outputSchema: {
      valid: z.boolean(),
    },
  },
  async ({ message, signatureBase64, publicKeyBase64 }) => {
    const variant = sodium.base64_variants.ORIGINAL;
    const signature = sodium.from_base64(signatureBase64, variant);
    const publicKey = sodium.from_base64(publicKeyBase64, variant);
    const valid = sodium.crypto_sign_verify_detached(
      signature,
      sodium.from_string(message),
      publicKey,
    );

    const result = { valid };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

async function main() {
  await sodium.ready;
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Interdict Crypto MCP server running with libsodium-wrappers");
}

main().catch((error) => {
  console.error("Fatal error in crypto MCP server:", error);
  process.exit(1);
});
