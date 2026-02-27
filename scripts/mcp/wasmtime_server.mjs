#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = process.env.INTERDICT_ROOT
  ? path.resolve(process.env.INTERDICT_ROOT)
  : process.cwd();

const server = new McpServer({
  name: "interdict-wasmtime-server",
  version: "0.1.0",
});

function resolvePathInsideRoot(inputPath) {
  const resolved = path.resolve(PROJECT_ROOT, inputPath);
  const normalizedRoot = path.resolve(PROJECT_ROOT);
  if (resolved === normalizedRoot || resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    return resolved;
  }
  throw new Error(`Path escapes project root: ${inputPath}`);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getWasmtimeStatus() {
  try {
    const { stdout, stderr } = await execFile("wasmtime", ["--version"], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    const version = stdout.trim() || stderr.trim();
    return {
      installed: true,
      version,
      message: "wasmtime CLI available",
    };
  } catch (error) {
    return {
      installed: false,
      version: null,
      message:
        "wasmtime CLI not found. Install from https://github.com/bytecodealliance/wasmtime/releases",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function walkWasmFiles(baseDir, maxResults) {
  const results = [];
  const queue = [baseDir];

  while (queue.length > 0 && results.length < maxResults) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) {
        break;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "target" && entry.name !== ".git" && entry.name !== "node_modules") {
          queue.push(fullPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".wasm")) {
        results.push(path.relative(PROJECT_ROOT, fullPath));
      }
    }
  }

  return results;
}

server.registerTool(
  "wasmtime_status",
  {
    title: "Wasmtime CLI Status",
    description: "Check whether Wasmtime CLI is installed and available on PATH",
    inputSchema: {},
    outputSchema: {
      installed: z.boolean(),
      version: z.string().nullable(),
      message: z.string(),
    },
  },
  async () => {
    const status = await getWasmtimeStatus();
    return {
      content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      structuredContent: status,
    };
  },
);

server.registerTool(
  "validate_wasm_module",
  {
    title: "Validate Wasm Module",
    description:
      "Validate a wasm module with Wasmtime compile. Input path must be inside the Interdict repo.",
    inputSchema: {
      wasmPath: z.string().describe("Path to .wasm file, relative to repo root or absolute inside repo"),
    },
    outputSchema: {
      success: z.boolean(),
      wasmPath: z.string(),
      command: z.string(),
      message: z.string(),
      diagnostics: z.string(),
    },
  },
  async ({ wasmPath }) => {
    const resolvedPath = resolvePathInsideRoot(wasmPath);
    const relPath = path.relative(PROJECT_ROOT, resolvedPath);

    if (!(await pathExists(resolvedPath))) {
      const result = {
        success: false,
        wasmPath: relPath,
        command: "wasmtime compile",
        message: "Wasm path not found",
        diagnostics: resolvedPath,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }

    const wasmtime = await getWasmtimeStatus();
    if (!wasmtime.installed) {
      const result = {
        success: false,
        wasmPath: relPath,
        command: "wasmtime compile",
        message: wasmtime.message,
        diagnostics: wasmtime.error ?? "wasmtime unavailable",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }

    const outFile = path.join(
      tmpdir(),
      `interdict-wasmtime-${Date.now()}-${Math.random().toString(16).slice(2)}.cwasm`,
    );

    try {
      const { stdout, stderr } = await execFile(
        "wasmtime",
        ["compile", resolvedPath, "-o", outFile],
        {
          timeout: 30_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );

      const result = {
        success: true,
        wasmPath: relPath,
        command: `wasmtime compile ${relPath} -o ${path.basename(outFile)}`,
        message: "Wasm module validated successfully",
        diagnostics: [stdout, stderr].filter(Boolean).join("\n").trim() || "ok",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      const result = {
        success: false,
        wasmPath: relPath,
        command: `wasmtime compile ${relPath}`,
        message: "Wasm validation failed",
        diagnostics: error instanceof Error ? error.message : String(error),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } finally {
      try {
        await fs.unlink(outFile);
      } catch {
        // Ignore cleanup failures.
      }
    }
  },
);

server.registerTool(
  "list_wasm_modules",
  {
    title: "List Wasm Modules",
    description: "List wasm files inside the Interdict repository",
    inputSchema: {
      relativeDir: z.string().optional().describe("Directory to scan, relative to repo root (default: crates)"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum results to return (default: 200)"),
    },
    outputSchema: {
      root: z.string(),
      scannedDir: z.string(),
      count: z.number(),
      modules: z.array(z.string()),
    },
  },
  async ({ relativeDir, maxResults }) => {
    const scanDir = resolvePathInsideRoot(relativeDir ?? "crates");
    const modules = await walkWasmFiles(scanDir, maxResults ?? 200);
    const result = {
      root: PROJECT_ROOT,
      scannedDir: path.relative(PROJECT_ROOT, scanDir) || ".",
      count: modules.length,
      modules,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Interdict Wasmtime MCP server running (root: ${PROJECT_ROOT})`);
}

main().catch((error) => {
  console.error("Fatal error in wasmtime MCP server:", error);
  process.exit(1);
});
