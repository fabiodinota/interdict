#!/usr/bin/env node
// Probe Interdict with a single chat completion request.
// Usage: node scripts/test/probe.mjs ["optional message"]
//
// Reads credentials from scripts/test/.env.test — never pass keys on the CLI.
// Uses Node's built-in https + tunnel through the proxy (avoids Windows schannel issues).

import { readFileSync, existsSync } from "fs";
import { createConnection } from "net";
import { connect as tlsConnect } from "tls";
import { request as httpsRequest } from "https";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(__dirname, ".env.test");
const REPO_ROOT = resolve(__dirname, "../..");

if (!existsSync(ENV_FILE)) {
  console.error(`ERROR: ${ENV_FILE} not found.`);
  console.error(`       cp ${__dirname}/.env.test.example ${ENV_FILE}  then fill in your keys.`);
  process.exit(1);
}

// Parse .env.test
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const required = ["OPENAI_API_KEY", "INTERDICT_PROXY", "INTERDICT_CA_CERT", "TEST_VENDOR_URL", "TEST_MODEL"];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`ERROR: missing required vars in .env.test: ${missing.join(", ")}`);
  process.exit(1);
}

const proxyUrl = new URL(env.INTERDICT_PROXY);
const vendorUrl = new URL(env.TEST_VENDOR_URL);
const model = env.TEST_MODEL;
const apiKey = env.OPENAI_API_KEY;
const message = process.argv[2] ?? "Hello from Interdict probe";

// Resolve CA cert path
let caPath = env.INTERDICT_CA_CERT;
if (caPath.startsWith("./") || caPath === "ca.crt") {
  caPath = join(REPO_ROOT, "ca.crt");
}
const ca = existsSync(caPath) ? readFileSync(caPath) : undefined;
if (!ca) {
  console.warn(`WARN: CA cert not found at ${caPath} — proceeding without it (cert validation may fail)`);
}

console.log(`Proxy : ${env.INTERDICT_PROXY}`);
console.log(`Vendor: ${env.TEST_VENDOR_URL}`);
console.log(`Model : ${model}`);
console.log("---");

const body = JSON.stringify({
  model,
  messages: [{ role: "user", content: message }],
});

// Step 1: Open TCP connection to proxy
const socket = createConnection(
  { host: proxyUrl.hostname, port: Number(proxyUrl.port) || 8443 },
  () => {
    // Step 2: Send HTTP CONNECT to establish tunnel
    socket.write(
      `CONNECT ${vendorUrl.hostname}:443 HTTP/1.1\r\nHost: ${vendorUrl.hostname}:443\r\n\r\n`
    );
  }
);

socket.once("data", (chunk) => {
  const response = chunk.toString();
  if (!response.startsWith("HTTP/1.1 200")) {
    console.error(`CONNECT failed:\n${response}`);
    socket.destroy();
    process.exit(1);
  }

  // Step 3: Upgrade to TLS over the tunnel, trust Interdict's CA
  const tlsSocket = tlsConnect({
    socket,
    servername: vendorUrl.hostname,
    ca: ca ?? undefined,
    rejectUnauthorized: !!ca,
  });

  tlsSocket.once("secureConnect", () => {
    // Step 4: Send the actual HTTPS request over the TLS tunnel
    const req = httpsRequest(
      {
        createConnection: () => tlsSocket,
        hostname: vendorUrl.hostname,
        path: vendorUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const text = json.choices?.[0]?.message?.content ?? JSON.stringify(json, null, 2);
            console.log(text);
          } catch {
            console.log(data);
          }
        });
      }
    );

    req.on("error", (e) => console.error("Request error:", e.message));
    req.write(body);
    req.end();
  });

  tlsSocket.on("error", (e) => console.error("TLS error:", e.message));
});

socket.on("error", (e) => console.error("Proxy connection error:", e.message));
