/**
 * Evidence Verification Service
 *
 * Two-step cryptographic verification of evidence bundles, plus a deferred
 * Merkle anchoring check:
 *
 * 1. Hash chain integrity — recomputes chain_hash from content bytes and
 *    verifies linkage to the predecessor bundle.  Matches the algorithm in
 *    the Rust `interdict-verify` tool: chain_hash = SHA-256(previous_hash ‖ content_bytes).
 *
 * 2. Ed25519 signature validation — verifies the collector's signature over
 *    the protobuf content bytes (bundle with chain/signature fields zeroed),
 *    matching the Rust collector's signing semantics.
 *
 * 3. Merkle proof (deferred) — the Merkle anchoring infrastructure exists in
 *    the Rust evidence-collector (hourly S3 WORM anchoring), but the control
 *    plane does not have S3 access.  Use the Rust `interdict-verify` CLI for
 *    full Merkle verification.
 *
 * Verification is server-side.  For independent offline verification use the
 * `interdict-verify` CLI tool, which loads bundles from ClickHouse exports
 * and recomputes all hashes from protobuf-serialized content.
 *
 * Uses ClickHouse for bundle data and Postgres for signing key lookup.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import { eq } from "drizzle-orm";
import { signingKeys } from "../../db/schema/auth";
import type { AppDb } from "../../shared/types";
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
} from "../../shared/utilities";
import type {
  EvidenceBundleListItem,
  EvidenceBundleRow,
  VerificationResult,
  VerificationStep,
} from "./model";

// ---------------------------------------------------------------------------
// Evidence columns (Invariant 6: no prompt_text, response_text)
// ---------------------------------------------------------------------------

const EVIDENCE_COLUMNS = [
  "bundle_id",
  "kernel_id",
  "chain_hash",
  "previous_hash",
  "sequence_number",
  "signature",
  "signing_key_id",
  "timestamp",
  "event_date",
  "actor_identity",
  "vendor",
  "model",
  "policy_action",
  "department",
  "content_bytes",
].join(", ");

// ---------------------------------------------------------------------------
// Helpers: hex decode / SHA-256
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`hexToBytes: odd-length hex string (${hex.length} chars)`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
  return new Uint8Array(hash);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

function toChDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function toDatePartition(value: Date | string): string {
  return value instanceof Date ? value.toISOString().substring(0, 10) : value.substring(0, 10);
}

// 32 zero bytes (hex-encoded) — the genesis sentinel for previous_hash
const GENESIS_PREVIOUS_HEX = "0".repeat(64);

// ---------------------------------------------------------------------------
// EvidenceVerificationService
// ---------------------------------------------------------------------------

export class EvidenceVerificationService {
  private clickhouse: ClickHouseClient;
  private db: AppDb;

  constructor(clickhouse: ClickHouseClient, db: AppDb) {
    this.clickhouse = clickhouse;
    this.db = db;
  }

  /**
   * List evidence bundles with pagination and department scoping.
   */
  async listBundles(
    filters: { from_date?: string; to_date?: string },
    cursor: string | undefined,
    pageSize: number | undefined,
    departmentIds?: string[],
  ): Promise<{
    items: EvidenceBundleListItem[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const conditions: string[] = [];
    const params: Record<string, unknown> = { limit: limit + 1 };

    // Date range for partition pruning
    if (filters.from_date) {
      conditions.push("event_date >= {from_date:String}");
      params.from_date = filters.from_date.substring(0, 10);
    } else {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      conditions.push("event_date >= {from_date:String}");
      params.from_date = sevenDaysAgo.toISOString().substring(0, 10);
    }

    if (filters.to_date) {
      conditions.push("event_date <= {to_date:String}");
      params.to_date = filters.to_date.substring(0, 10);
    }

    // Cursor pagination
    if (cursor) {
      const c = decodeCursor(cursor);
      conditions.push(
        "(timestamp < {cursor_ts:DateTime64(3)} OR (timestamp = {cursor_ts:DateTime64(3)} AND bundle_id < {cursor_id:String}))",
      );
      params.cursor_ts = toChDateTime(new Date(c.timestamp));
      params.cursor_id = c.id;
    }

    // Department scoping
    if (departmentIds && departmentIds.length > 0) {
      conditions.push("department IN {dept_ids:Array(String)}");
      params.dept_ids = departmentIds;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `SELECT ${EVIDENCE_COLUMNS} FROM evidence_bundles ${where} ORDER BY timestamp DESC, bundle_id DESC LIMIT {limit:UInt32}`;

    const resultSet = await this.clickhouse.query({
      query,
      format: "JSONEachRow",
      query_params: params,
    });

    const rows: EvidenceBundleRow[] = await resultSet.json();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(
            new Date(items[items.length - 1].timestamp).getTime(),
            items[items.length - 1].bundle_id,
          )
        : null;

    return {
      items: items.map((row) => ({
        bundle_id: row.bundle_id,
        chain_hash: row.chain_hash,
        previous_hash: row.previous_hash,
        sequence_number: row.sequence_number,
        signature: row.signature,
        signing_key_id: row.signing_key_id,
        timestamp: row.timestamp,
        actor_identity: row.actor_identity,
        vendor: row.vendor,
        policy_action: row.policy_action,
      })),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Verify one or more evidence bundles through three-step verification.
   */
  async verifyBundles(bundleIds: string[]): Promise<VerificationResult[]> {
    // Fetch all requested bundles from ClickHouse
    const bundleMap = await this.fetchBundles(bundleIds);
    const results: VerificationResult[] = [];

    for (const bundleId of bundleIds) {
      const bundle = bundleMap.get(bundleId);
      if (!bundle) {
        results.push({
          bundleId,
          steps: [
            {
              name: "Hash Chain",
              passed: false,
              details: { error: "Bundle not found in evidence store" },
            },
            {
              name: "Ed25519 Signature",
              passed: false,
              details: { error: "Bundle not found" },
            },
            {
              name: "Merkle Anchor",
              passed: null,
              details: { reason: "Bundle not found" },
            },
          ],
          overall: "fail",
        });
        continue;
      }

      const steps: VerificationStep[] = [];

      // Step 1: Hash chain integrity verification (with recomputation)
      const chainStep = await this.verifyHashChain(bundle);
      steps.push(chainStep);

      // Step 2: Ed25519 signature verification (over content bytes)
      const sigStep = await this.verifySignature(bundle);
      steps.push(sigStep);

      // Step 3: Merkle anchor (deferred — requires S3 access)
      steps.push({
        name: "Merkle Anchor",
        passed: null,
        details: {
          status: "Deferred",
          reason:
            "Merkle root anchoring is implemented in the Rust evidence-collector " +
            "(hourly S3 WORM anchoring). The control plane does not have S3 access. " +
            "Use the `interdict-verify` CLI tool with --anchor-dir for full Merkle verification.",
        },
      });

      // Compute overall result
      const hasFail = steps.some((s) => s.passed === false);
      const hasNull = steps.some((s) => s.passed === null);
      const overall = hasFail ? "fail" : hasNull ? "partial" : "pass";

      results.push({ bundleId, steps, overall });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch bundles and their predecessors from ClickHouse.
   */
  private async fetchBundles(bundleIds: string[]): Promise<Map<string, EvidenceBundleRow>> {
    if (bundleIds.length === 0) return new Map();

    const metadataResult = await this.clickhouse.query({
      query: `SELECT bundle_id, event_date FROM evidence_bundles WHERE bundle_id IN {ids:Array(String)}`,
      format: "JSONEachRow",
      query_params: { ids: bundleIds },
    });

    const metadataRows: Array<Pick<EvidenceBundleRow, "bundle_id" | "event_date">> =
      await metadataResult.json();
    if (metadataRows.length === 0) return new Map();

    const eventDates = Array.from(new Set(metadataRows.map((row) => row.event_date)));

    const resultSet = await this.clickhouse.query({
      query: `SELECT ${EVIDENCE_COLUMNS} FROM evidence_bundles WHERE event_date IN {event_dates:Array(String)} AND bundle_id IN {ids:Array(String)}`,
      format: "JSONEachRow",
      query_params: { event_dates: eventDates, ids: bundleIds },
    });

    const rows: EvidenceBundleRow[] = await resultSet.json();
    const map = new Map<string, EvidenceBundleRow>();
    for (const row of rows) {
      map.set(row.bundle_id, row);
    }
    return map;
  }

  /**
   * Fetch the predecessor bundle for chain verification.
   */
  private async fetchPredecessor(
    kernelId: string,
    sequenceNumber: number,
    currentTimestamp: string,
  ): Promise<EvidenceBundleRow | null> {
    if (sequenceNumber <= 1) return null;

    const currentDate = new Date(currentTimestamp);
    const fromDate = new Date(currentDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - 1);

    const resultSet = await this.clickhouse.query({
      query: `SELECT ${EVIDENCE_COLUMNS} FROM evidence_bundles WHERE event_date >= {from_date:String} AND event_date <= {to_date:String} AND kernel_id = {kernel_id:String} AND sequence_number = {seq:UInt64} LIMIT 1`,
      format: "JSONEachRow",
      query_params: {
        from_date: toDatePartition(fromDate),
        to_date: toDatePartition(currentDate),
        kernel_id: kernelId,
        seq: sequenceNumber - 1,
      },
    });

    const rows: EvidenceBundleRow[] = await resultSet.json();
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Step 1: Verify hash chain integrity.
   *
   * For each bundle the check is:
   * - Genesis (sequence_number == 1): previous_hash must be 32 zero bytes.
   * - Non-genesis: previous_hash must equal predecessor's chain_hash.
   * - If content_bytes are available, recompute chain_hash = SHA-256(previous_hash || content_bytes)
   *   and verify it matches the stored chain_hash (same algorithm as interdict-verify).
   */
  private async verifyHashChain(bundle: EvidenceBundleRow): Promise<VerificationStep> {
    const seqNum =
      typeof bundle.sequence_number === "string"
        ? parseInt(bundle.sequence_number, 10)
        : bundle.sequence_number;

    // Genesis bundle: sequence_number == 1, previous_hash must be 32 zero bytes
    if (seqNum === 1) {
      const isGenesisValid = bundle.previous_hash === GENESIS_PREVIOUS_HEX;

      // If content_bytes are available, also verify chain_hash recomputation
      let chainHashValid: boolean | null = null;
      let recomputedChainHash = "";
      if (bundle.content_bytes && bundle.content_bytes.length > 0) {
        const prevBytes = hexToBytes(GENESIS_PREVIOUS_HEX);
        const contentBytes = hexToBytes(bundle.content_bytes);
        const hashInput = concatBytes(prevBytes, contentBytes);
        const computedHash = await sha256(hashInput);
        recomputedChainHash = bytesToHex(computedHash);
        chainHashValid = recomputedChainHash === bundle.chain_hash;
      }

      const passed = isGenesisValid && (chainHashValid === null || chainHashValid);

      return {
        name: "Hash Chain",
        passed,
        details: {
          bundle_id: bundle.bundle_id,
          sequence_number: String(seqNum),
          previous_hash: bundle.previous_hash,
          status: passed
            ? "Genesis bundle verified"
            : isGenesisValid
              ? "Genesis previous_hash valid but chain_hash recomputation failed"
              : "Genesis bundle has unexpected previous_hash",
          chain_hash: bundle.chain_hash,
          ...(chainHashValid !== null
            ? {
                chain_hash_recomputed: recomputedChainHash,
                chain_hash_match: chainHashValid ? "true" : "false",
              }
            : { chain_hash_recomputed: "skipped (no content_bytes stored)" }),
        },
      };
    }

    // Non-genesis: fetch predecessor
    const predecessor = await this.fetchPredecessor(bundle.kernel_id, seqNum, bundle.timestamp);

    if (!predecessor) {
      return {
        name: "Hash Chain",
        passed: false,
        details: {
          bundle_id: bundle.bundle_id,
          sequence_number: String(seqNum),
          error: `Predecessor bundle (seq ${seqNum - 1}) not found for kernel ${bundle.kernel_id}`,
          expected_previous_hash: bundle.previous_hash,
        },
      };
    }

    const linkageValid = bundle.previous_hash === predecessor.chain_hash;

    // If content_bytes are available, also verify chain_hash recomputation
    let chainHashValid: boolean | null = null;
    let recomputedChainHash = "";
    if (linkageValid && bundle.content_bytes && bundle.content_bytes.length > 0) {
      const prevBytes = hexToBytes(bundle.previous_hash);
      const contentBytes = hexToBytes(bundle.content_bytes);
      const hashInput = concatBytes(prevBytes, contentBytes);
      const computedHash = await sha256(hashInput);
      recomputedChainHash = bytesToHex(computedHash);
      chainHashValid = recomputedChainHash === bundle.chain_hash;
    }

    const passed = linkageValid && (chainHashValid === null || chainHashValid);

    return {
      name: "Hash Chain",
      passed,
      details: {
        bundle_id: bundle.bundle_id,
        sequence_number: String(seqNum),
        previous_hash: bundle.previous_hash,
        predecessor_chain_hash: predecessor.chain_hash,
        predecessor_bundle_id: predecessor.bundle_id,
        predecessor_sequence: String(seqNum - 1),
        linkage_match: linkageValid ? "true" : "false",
        ...(chainHashValid !== null
          ? {
              chain_hash_recomputed: recomputedChainHash,
              chain_hash_match: chainHashValid ? "true" : "false",
            }
          : { chain_hash_recomputed: "skipped (no content_bytes stored)" }),
      },
    };
  }

  /**
   * Step 2: Verify Ed25519 signature.
   *
   * The evidence collector signs the protobuf content bytes (bundle with
   * chain/signature metadata fields zeroed) using Ed25519.  This matches the
   * verification semantics of the Rust `interdict-verify` tool.
   *
   * If content_bytes are not available (pre-migration bundles), the signature
   * check is skipped with an explicit explanation rather than producing a
   * false failure.
   */
  private async verifySignature(bundle: EvidenceBundleRow): Promise<VerificationStep> {
    // content_bytes are required for correct signature verification
    if (!bundle.content_bytes || bundle.content_bytes.length === 0) {
      return {
        name: "Ed25519 Signature",
        passed: null,
        details: {
          signing_key_id: bundle.signing_key_id,
          status: "Skipped",
          reason:
            "Bundle was stored before content_bytes column was added. " +
            "Signature verification requires content_bytes to reconstruct the " +
            "signed payload. Use the `interdict-verify` CLI for offline verification.",
        },
      };
    }

    // Look up signing key in Postgres
    const keys = await this.db
      .select()
      .from(signingKeys)
      .where(eq(signingKeys.keyId, bundle.signing_key_id))
      .limit(1);

    if (!keys || keys.length === 0) {
      return {
        name: "Ed25519 Signature",
        passed: false,
        details: {
          signing_key_id: bundle.signing_key_id,
          error: `Signing key '${bundle.signing_key_id}' not found in key registry`,
        },
      };
    }

    const publicKeyHex = keys[0].publicKeyHex;

    try {
      // Decode hex values
      const signatureBytes = hexToBytes(bundle.signature);
      const contentBytes = hexToBytes(bundle.content_bytes);
      const publicKeyBytes = hexToBytes(publicKeyHex);

      // Validate expected sizes
      if (publicKeyBytes.length !== 32) {
        return {
          name: "Ed25519 Signature",
          passed: false,
          details: {
            signing_key_id: bundle.signing_key_id,
            error: `Public key must be 32 bytes, got ${publicKeyBytes.length}`,
          },
        };
      }
      if (signatureBytes.length !== 64) {
        return {
          name: "Ed25519 Signature",
          passed: false,
          details: {
            signing_key_id: bundle.signing_key_id,
            error: `Signature must be 64 bytes, got ${signatureBytes.length}`,
          },
        };
      }

      // Import public key as Ed25519 CryptoKey
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        publicKeyBytes as unknown as BufferSource,
        { name: "Ed25519" },
        false,
        ["verify"],
      );

      // Verify signature over the protobuf content bytes (not chain_hash).
      // This matches the collector's signing: Ed25519.sign(content_bytes).
      const valid = await crypto.subtle.verify(
        "Ed25519",
        cryptoKey,
        signatureBytes as unknown as BufferSource,
        contentBytes as unknown as BufferSource,
      );

      return {
        name: "Ed25519 Signature",
        passed: valid,
        details: {
          signing_key_id: bundle.signing_key_id,
          public_key_hex: publicKeyHex,
          signature_hex: `${bundle.signature.substring(0, 32)}...`,
          content_bytes_length: String(contentBytes.length),
          valid: valid ? "true" : "false",
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: "Ed25519 Signature",
        passed: false,
        details: {
          signing_key_id: bundle.signing_key_id,
          public_key_hex: publicKeyHex,
          error: `Verification error: ${message}`,
        },
      };
    }
  }
}
