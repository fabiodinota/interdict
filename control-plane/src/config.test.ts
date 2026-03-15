/**
 * Config Tests
 *
 * Tests requireEnv() behavior with set and unset environment variables.
 * Since requireEnv is not exported, we test it through loadConfig()
 * which exercises the same code path.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "./config";

describe("config", () => {
  // Save and restore env
  const originalEnv: Record<string, string | undefined> = {};
  const keysToRestore = [
    "PORT",
    "DATABASE_URL",
    "CLICKHOUSE_URL",
    "CLICKHOUSE_DATABASE",
    "CLICKHOUSE_USER",
    "CLICKHOUSE_PASSWORD",
    "WASM_STORAGE_DIR",
    "OPA_BINARY_PATH",
    "INTERDICT_GRPC_PORT",
    "INTERDICT_GRPC_MAX_MESSAGE_SIZE",
    "NODE_ENV",
  ];

  beforeEach(() => {
    for (const key of keysToRestore) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keysToRestore) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  // -----------------------------------------------------------------------
  // requireEnv (tested via loadConfig)
  // -----------------------------------------------------------------------
  describe("requireEnv via loadConfig", () => {
    it("uses environment variable when set", () => {
      process.env.PORT = "4000";
      process.env.NODE_ENV = "development";

      const config = loadConfig();

      expect(config.port).toBe(4000);
    });

    it("uses fallback values in non-production mode", () => {
      // Clear all env vars to test fallbacks
      delete process.env.PORT;
      delete process.env.DATABASE_URL;
      delete process.env.CLICKHOUSE_URL;
      delete process.env.CLICKHOUSE_DATABASE;
      delete process.env.WASM_STORAGE_DIR;
      delete process.env.OPA_BINARY_PATH;
      delete process.env.INTERDICT_GRPC_PORT;
      delete process.env.NODE_ENV;

      const config = loadConfig();

      expect(config.port).toBe(3000); // default
      expect(config.clickhouseUrl).toBe("http://localhost:8123");
      expect(config.clickhouseDatabase).toBe("interdict");
      expect(config.wasmStorageDir).toBe("./data/wasm");
    });

    // Note: isProduction is evaluated at module load time (const), so
    // we cannot toggle it dynamically. Instead we verify requireEnv
    // behavior via port validation (which always throws) and the
    // fallback path (which works because isProduction=false at import).

    it("applies fallback values when env vars are unset in dev mode", () => {
      delete process.env.DATABASE_URL;
      delete process.env.CLICKHOUSE_URL;
      delete process.env.NODE_ENV;

      const config = loadConfig();

      // Fallback should be the dev default
      expect(config.databaseUrl).toContain("localhost:5432");
      expect(config.clickhouseUrl).toBe("http://localhost:8123");
    });
  });

  // -----------------------------------------------------------------------
  // Port validation
  // -----------------------------------------------------------------------
  describe("port validation", () => {
    it("rejects non-numeric port", () => {
      process.env.PORT = "abc";

      expect(() => loadConfig()).toThrow("Invalid PORT");
    });

    it("rejects port above 65535", () => {
      process.env.PORT = "99999";

      expect(() => loadConfig()).toThrow("Invalid PORT");
    });

    it("rejects port 0", () => {
      process.env.PORT = "0";

      expect(() => loadConfig()).toThrow("Invalid PORT");
    });

    it("rejects negative port", () => {
      process.env.PORT = "-1";

      expect(() => loadConfig()).toThrow("Invalid PORT");
    });
  });

  // -----------------------------------------------------------------------
  // gRPC port validation
  // -----------------------------------------------------------------------
  describe("gRPC port validation", () => {
    it("rejects invalid gRPC port", () => {
      process.env.INTERDICT_GRPC_PORT = "notaport";

      expect(() => loadConfig()).toThrow("Invalid INTERDICT_GRPC_PORT");
    });

    it("uses default gRPC port 50052", () => {
      delete process.env.INTERDICT_GRPC_PORT;
      delete process.env.NODE_ENV;

      const config = loadConfig();

      expect(config.grpcPort).toBe(50052);
    });
  });

  // -----------------------------------------------------------------------
  // Optional vars with defaults
  // -----------------------------------------------------------------------
  describe("optional vars", () => {
    it("uses default for CLICKHOUSE_USER when not set", () => {
      delete process.env.CLICKHOUSE_USER;
      delete process.env.NODE_ENV;

      const config = loadConfig();

      expect(config.clickhouseUser).toBe("default");
    });

    it("uses empty string for CLICKHOUSE_PASSWORD when not set", () => {
      delete process.env.CLICKHOUSE_PASSWORD;
      delete process.env.NODE_ENV;

      const config = loadConfig();

      expect(config.clickhousePassword).toBe("");
    });
  });
});
