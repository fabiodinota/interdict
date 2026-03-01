/**
 * Auth Service Tests
 *
 * Unit tests for key generation and hashing utilities.
 * These functions are deterministic and do not require database access.
 */

import { describe, test, expect } from "bun:test";
import { hashApiKey, generateApiKey } from "./service";

describe("hashApiKey", () => {
  test("produces a 64-character hex string", () => {
    const hash = hashApiKey("test-key");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("produces consistent hashes for the same input", () => {
    const hash1 = hashApiKey("my-secret-key");
    const hash2 = hashApiKey("my-secret-key");
    expect(hash1).toBe(hash2);
  });

  test("produces different hashes for different inputs", () => {
    const hash1 = hashApiKey("key-alpha");
    const hash2 = hashApiKey("key-beta");
    expect(hash1).not.toBe(hash2);
  });

  test("handles empty string", () => {
    const hash = hashApiKey("");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("handles long input", () => {
    const longKey = "x".repeat(10000);
    const hash = hashApiKey(longKey);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateApiKey", () => {
  test("plaintext starts with ik_live_ prefix", () => {
    const { plaintext } = generateApiKey();
    expect(plaintext.startsWith("ik_live_")).toBe(true);
  });

  test("hash is a 64-character hex string", () => {
    const { hash } = generateApiKey();
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("prefix is the first 16 characters of plaintext", () => {
    const { plaintext, prefix } = generateApiKey();
    expect(prefix).toBe(plaintext.substring(0, 16));
    expect(prefix).toHaveLength(16);
  });

  test("hash matches hashing the plaintext", () => {
    const { plaintext, hash } = generateApiKey();
    const recomputed = hashApiKey(plaintext);
    expect(hash).toBe(recomputed);
  });

  test("generates unique keys on each call", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { plaintext } = generateApiKey();
      keys.add(plaintext);
    }
    // All 50 should be unique
    expect(keys.size).toBe(50);
  });

  test("plaintext has sufficient entropy (base64url random)", () => {
    const { plaintext } = generateApiKey();
    // ik_live_ (8 chars) + base64url of 32 random bytes (43 chars) = 51 chars
    expect(plaintext.length).toBeGreaterThanOrEqual(50);
  });

  test("prefix starts with ik_live_", () => {
    const { prefix } = generateApiKey();
    expect(prefix.startsWith("ik_live_")).toBe(true);
  });
});
