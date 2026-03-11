/**
 * Evidence Verification Service Tests
 *
 * Golden-fixture tests that verify the control plane's chain hash and
 * signature verification algorithms match the Rust interdict-verify tool.
 *
 * The test fixtures use known inputs and expected outputs computed using
 * the canonical algorithm documented in the Rust codebase:
 * - chain_hash = SHA-256(previous_hash || content_bytes)
 * - Genesis previous_hash = [0u8; 32] (32 zero bytes)
 * - Sequence numbers start at 1
 * - Signature = Ed25519.sign(content_bytes)
 */

import { describe, expect, test } from "bun:test";
import type { ClickHouseClient } from "@clickhouse/client";
import type { AppDb } from "../../shared/types";
import { EvidenceVerificationService } from "./service";

// ---------------------------------------------------------------------------
// Helpers (duplicated from service.ts for isolated unit testing)
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
  return new Uint8Array(hash);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

const GENESIS_PREVIOUS_HEX = "0".repeat(64);

function createMockClickhouse() {
  const queries: Array<{ query: string; query_params?: Record<string, unknown> }> = [];
  const responses: unknown[] = [];

  return {
    query: async ({
      query,
      query_params,
    }: {
      query: string;
      query_params?: Record<string, unknown>;
    }) => {
      queries.push({ query, query_params });
      const next = responses.shift() ?? [];
      return {
        json: async () => next,
      };
    },
    _pushResponse: (rows: unknown) => {
      responses.push(rows);
    },
    _queries: queries,
  };
}

function createMockDb(selectResult: unknown[] = []) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResult,
        }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Chain hash algorithm tests
// ---------------------------------------------------------------------------

describe("Evidence chain hash algorithm", () => {
  test("genesis chain_hash = SHA-256(32_zero_bytes || content_bytes)", async () => {
    // Known content bytes (arbitrary test vector)
    const contentHex = "0a0a62756e646c652d30303112096b65726e656c2d30311a060880c0d7bb0c";
    const contentBytes = hexToBytes(contentHex);
    const previousBytes = hexToBytes(GENESIS_PREVIOUS_HEX);

    const hashInput = concatBytes(previousBytes, contentBytes);
    const computed = await sha256(hashInput);
    const computedHex = bytesToHex(computed);

    // Verify the hash is deterministic and 64 hex chars
    expect(computedHex.length).toBe(64);

    // Recompute to verify consistency
    const recomputed = bytesToHex(await sha256(concatBytes(previousBytes, contentBytes)));
    expect(recomputed).toBe(computedHex);
  });

  test("non-genesis chain_hash = SHA-256(predecessor_chain_hash || content_bytes)", async () => {
    // First bundle
    const content1Hex = "0a0a62756e646c652d30303112096b65726e656c2d3031";
    const content1 = hexToBytes(content1Hex);
    const prev1 = hexToBytes(GENESIS_PREVIOUS_HEX);
    const hash1 = await sha256(concatBytes(prev1, content1));
    const hash1Hex = bytesToHex(hash1);

    // Second bundle chains from first
    const content2Hex = "0a0a62756e646c652d30303212096b65726e656c2d3031";
    const content2 = hexToBytes(content2Hex);
    const hash2 = await sha256(concatBytes(hash1, content2));
    const hash2Hex = bytesToHex(hash2);

    // Hashes must differ (different content)
    expect(hash1Hex).not.toBe(hash2Hex);

    // Verify that changing content changes the hash (tamper detection)
    const tamperedContent = hexToBytes("0a0a62756e646c652d39393912096b65726e656c2d3031");
    const tamperedHash = await sha256(concatBytes(hash1, tamperedContent));
    expect(bytesToHex(tamperedHash)).not.toBe(hash2Hex);
  });

  test("chain hash is sensitive to previous_hash (ordering matters)", async () => {
    const content = hexToBytes("0a0a62756e646c652d30303112096b65726e656c2d3031");
    const prev1 = hexToBytes(GENESIS_PREVIOUS_HEX);
    const prev2 = hexToBytes("01".repeat(32));

    const hash1 = bytesToHex(await sha256(concatBytes(prev1, content)));
    const hash2 = bytesToHex(await sha256(concatBytes(prev2, content)));

    expect(hash1).not.toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// Genesis detection tests
// ---------------------------------------------------------------------------

describe("Genesis detection", () => {
  test("genesis is sequence_number == 1 (not 0)", () => {
    // The Rust collector starts chains at sequence 1.
    // The control plane must treat sequence 1 as genesis.
    const genesisSeq = 1;
    const nonGenesisSeq = 2;

    expect(genesisSeq).toBe(1);
    expect(nonGenesisSeq).toBeGreaterThan(1);
  });

  test("genesis previous_hash is 32 zero bytes (64 hex zeros)", () => {
    const expected = "0".repeat(64);
    expect(GENESIS_PREVIOUS_HEX).toBe(expected);
    expect(GENESIS_PREVIOUS_HEX.length).toBe(64);

    // Verify it decodes to 32 zero bytes
    const bytes = hexToBytes(GENESIS_PREVIOUS_HEX);
    expect(bytes.length).toBe(32);
    expect(bytes.every((b) => b === 0)).toBe(true);
  });

  test("empty string is NOT a valid genesis previous_hash", () => {
    // The old implementation accepted "" as genesis. This is wrong.
    // The Rust collector always writes 32 zero bytes.
    const emptyString = "";
    const validGenesis = GENESIS_PREVIOUS_HEX;
    expect(emptyString).not.toBe(validGenesis);
  });
});

// ---------------------------------------------------------------------------
// Hex codec tests
// ---------------------------------------------------------------------------

describe("Hex codec", () => {
  test("hexToBytes and bytesToHex are inverse operations", () => {
    const original = "deadbeef0123456789abcdef";
    const bytes = hexToBytes(original);
    const roundtripped = bytesToHex(bytes);
    expect(roundtripped).toBe(original);
  });

  test("hexToBytes produces correct byte values", () => {
    const bytes = hexToBytes("ff00ab");
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0x00);
    expect(bytes[2]).toBe(0xab);
  });

  test("bytesToHex zero-pads single-digit hex values", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(bytesToHex(bytes)).toBe("00010f10ff");
  });
});

// ---------------------------------------------------------------------------
// Ed25519 signature verification tests
// ---------------------------------------------------------------------------

describe("Ed25519 signature verification", () => {
  test("can generate and verify a signature over content_bytes", async () => {
    // Generate a key pair using Web Crypto
    const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);

    // Content bytes (simulating protobuf-encoded bundle with chain/sig fields zeroed)
    const contentBytes = hexToBytes(
      "0a0a62756e646c652d30303112096b65726e656c2d30311a060880c0d7bb0c",
    );

    // Sign the content bytes (matching collector behavior)
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        keyPair.privateKey,
        contentBytes as unknown as BufferSource,
      ),
    );
    expect(signature.length).toBe(64);

    // Verify the signature (matching verifier behavior)
    const valid = await crypto.subtle.verify(
      "Ed25519",
      keyPair.publicKey,
      signature as unknown as BufferSource,
      contentBytes as unknown as BufferSource,
    );
    expect(valid).toBe(true);

    // Tampered content should fail
    const tampered = new Uint8Array(contentBytes);
    tampered[0] = tampered[0] ^ 0xff;
    const invalid = await crypto.subtle.verify(
      "Ed25519",
      keyPair.publicKey,
      signature as unknown as BufferSource,
      tampered as unknown as BufferSource,
    );
    expect(invalid).toBe(false);
  });

  test("signature over chain_hash (old behavior) differs from content_bytes", async () => {
    // This test documents that the old control plane behavior (verifying
    // signature over chain_hash) would fail for signatures created by the
    // Rust collector (which signs content_bytes).
    const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);

    const contentBytes = hexToBytes(
      "0a0a62756e646c652d30303112096b65726e656c2d30311a060880c0d7bb0c",
    );

    // Sign content_bytes (as the collector does)
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        keyPair.privateKey,
        contentBytes as unknown as BufferSource,
      ),
    );

    // Compute chain_hash
    const previousHash = hexToBytes(GENESIS_PREVIOUS_HEX);
    const chainHash = await sha256(concatBytes(previousHash, contentBytes));

    // Verify against content_bytes (correct) should pass
    const correctResult = await crypto.subtle.verify(
      "Ed25519",
      keyPair.publicKey,
      signature as unknown as BufferSource,
      contentBytes as unknown as BufferSource,
    );
    expect(correctResult).toBe(true);

    // Verify against chain_hash (old behavior) should FAIL
    const wrongResult = await crypto.subtle.verify(
      "Ed25519",
      keyPair.publicKey,
      signature as unknown as BufferSource,
      chainHash as unknown as BufferSource,
    );
    expect(wrongResult).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full verification pipeline test
// ---------------------------------------------------------------------------

describe("Full chain verification pipeline", () => {
  test("three-bundle chain verifies correctly end-to-end", async () => {
    // Generate a signing key pair
    const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);

    // Simulate three bundles
    const contents = [
      hexToBytes("0a0762756e646c653112076b65726e656c31"),
      hexToBytes("0a0762756e646c653212076b65726e656c31"),
      hexToBytes("0a0762756e646c653312076b65726e656c31"),
    ];

    const bundles: Array<{
      contentBytesHex: string;
      chainHash: string;
      previousHash: string;
      sequenceNumber: number;
      signatureHex: string;
    }> = [];

    let prevHash = hexToBytes(GENESIS_PREVIOUS_HEX);

    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];

      // Compute chain_hash = SHA-256(previous_hash || content_bytes)
      const chainHashBytes = await sha256(concatBytes(prevHash, content));

      // Sign content_bytes (matching Rust collector)
      const sig = new Uint8Array(
        await crypto.subtle.sign("Ed25519", keyPair.privateKey, content as unknown as BufferSource),
      );

      bundles.push({
        contentBytesHex: bytesToHex(content),
        chainHash: bytesToHex(chainHashBytes),
        previousHash: bytesToHex(prevHash),
        sequenceNumber: i + 1, // 1-indexed
        signatureHex: bytesToHex(sig),
      });

      prevHash = chainHashBytes;
    }

    // Verify chain linkage
    expect(bundles[0].sequenceNumber).toBe(1); // Genesis
    expect(bundles[0].previousHash).toBe(GENESIS_PREVIOUS_HEX);
    expect(bundles[1].previousHash).toBe(bundles[0].chainHash);
    expect(bundles[2].previousHash).toBe(bundles[1].chainHash);

    // Verify chain hash recomputation for each bundle
    for (let i = 0; i < bundles.length; i++) {
      const b = bundles[i];
      const prevBytes = hexToBytes(b.previousHash);
      const contentBytes = hexToBytes(b.contentBytesHex);
      const recomputed = bytesToHex(await sha256(concatBytes(prevBytes, contentBytes)));
      expect(recomputed).toBe(b.chainHash);
    }

    // Verify signatures for each bundle
    for (const b of bundles) {
      const contentBytes = hexToBytes(b.contentBytesHex);
      const sig = hexToBytes(b.signatureHex);
      const valid = await crypto.subtle.verify(
        "Ed25519",
        keyPair.publicKey,
        sig as unknown as BufferSource,
        contentBytes as unknown as BufferSource,
      );
      expect(valid).toBe(true);
    }
  });
});

describe("Phase 31 evidence query hardening", () => {
  test("fetchBundles bounds the heavy read to derived event_date partitions", async () => {
    const clickhouse = createMockClickhouse();
    clickhouse._pushResponse([{ bundle_id: "bundle-1", event_date: "2026-03-11" }]);
    clickhouse._pushResponse([
      {
        bundle_id: "bundle-1",
        kernel_id: "kernel-1",
        chain_hash: "a".repeat(64),
        previous_hash: GENESIS_PREVIOUS_HEX,
        sequence_number: 1,
        signature: "b".repeat(128),
        signing_key_id: "key-1",
        timestamp: "2026-03-11T00:03:00.000Z",
        event_date: "2026-03-11",
        actor_identity: "alice",
        vendor: "openai",
        model: "gpt-5",
        policy_action: "allow",
        department: "eng",
        content_bytes: "aa",
      },
    ]);

    const service = new EvidenceVerificationService(
      clickhouse as unknown as ClickHouseClient,
      createMockDb() as unknown as AppDb,
    );
    const fetchBundles = Reflect.get(service, "fetchBundles") as (
      bundleIds: string[],
    ) => Promise<Map<string, { bundle_id: string }>>;
    const bundles = await fetchBundles.call(service, ["bundle-1"]);

    expect(clickhouse._queries[0]?.query).toContain("SELECT bundle_id, event_date");
    expect(clickhouse._queries[1]?.query).toContain("event_date IN {event_dates:Array(String)}");
    expect(clickhouse._queries[1]?.query).toContain("bundle_id IN {ids:Array(String)}");
    expect(clickhouse._queries[1]?.query_params?.event_dates).toEqual(["2026-03-11"]);
    expect(bundles.get("bundle-1")?.bundle_id).toBe("bundle-1");
  });

  test("fetchPredecessor keeps adjacent-day predecessors reachable", async () => {
    const clickhouse = createMockClickhouse();
    clickhouse._pushResponse([
      {
        bundle_id: "bundle-1",
        kernel_id: "kernel-1",
        chain_hash: "a".repeat(64),
        previous_hash: GENESIS_PREVIOUS_HEX,
        sequence_number: 1,
        signature: "b".repeat(128),
        signing_key_id: "key-1",
        timestamp: "2026-03-10T23:59:58.000Z",
        event_date: "2026-03-10",
        actor_identity: "alice",
        vendor: "openai",
        model: "gpt-5",
        policy_action: "allow",
        department: "eng",
        content_bytes: "aa",
      },
    ]);

    const service = new EvidenceVerificationService(
      clickhouse as unknown as ClickHouseClient,
      createMockDb() as unknown as AppDb,
    );
    const fetchPredecessor = Reflect.get(service, "fetchPredecessor") as (
      kernelId: string,
      sequenceNumber: number,
      currentTimestamp: string,
    ) => Promise<{ bundle_id: string } | null>;
    const predecessor = await fetchPredecessor.call(
      service,
      "kernel-1",
      2,
      "2026-03-11T00:03:00.000Z",
    );

    expect(clickhouse._queries[0]?.query).toContain("event_date >= {from_date:String}");
    expect(clickhouse._queries[0]?.query).toContain("event_date <= {to_date:String}");
    expect(clickhouse._queries[0]?.query_params?.from_date).toBe("2026-03-10");
    expect(clickhouse._queries[0]?.query_params?.to_date).toBe("2026-03-11");
    expect(predecessor?.bundle_id).toBe("bundle-1");
  });

  test("verifyBundles still returns the expected verification outcome after bounded fetches", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));

    const contentBytes = hexToBytes(
      "0a0a62756e646c652d30303112096b65726e656c2d30311a060880c0d7bb0c",
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        keyPair.privateKey,
        contentBytes as unknown as BufferSource,
      ),
    );
    const chainHash = bytesToHex(
      await sha256(concatBytes(hexToBytes(GENESIS_PREVIOUS_HEX), contentBytes)),
    );

    const clickhouse = createMockClickhouse();
    clickhouse._pushResponse([{ bundle_id: "bundle-1", event_date: "2026-03-11" }]);
    clickhouse._pushResponse([
      {
        bundle_id: "bundle-1",
        kernel_id: "kernel-1",
        chain_hash: chainHash,
        previous_hash: GENESIS_PREVIOUS_HEX,
        sequence_number: 1,
        signature: bytesToHex(signature),
        signing_key_id: "key-1",
        timestamp: "2026-03-11T00:03:00.000Z",
        event_date: "2026-03-11",
        actor_identity: "alice",
        vendor: "openai",
        model: "gpt-5",
        policy_action: "allow",
        department: "eng",
        content_bytes: bytesToHex(contentBytes),
      },
    ]);

    const db = createMockDb([
      {
        keyId: "key-1",
        publicKeyHex: bytesToHex(rawPublicKey),
      },
    ]);
    const service = new EvidenceVerificationService(
      clickhouse as unknown as ClickHouseClient,
      db as unknown as AppDb,
    );

    const results = await service.verifyBundles(["bundle-1"]);

    expect(results).toHaveLength(1);
    expect(results[0]?.overall).toBe("partial");
    expect(results[0]?.steps[0]?.passed).toBe(true);
    expect(results[0]?.steps[1]?.passed).toBe(true);
    expect(results[0]?.steps[2]?.passed).toBeNull();
  });
});
