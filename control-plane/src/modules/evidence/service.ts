/**
 * Evidence Verification Service
 *
 * Three-step cryptographic verification of evidence bundles:
 * 1. Hash chain linkage (chain_hash[n] links to previous_hash[n] = chain_hash[n-1])
 * 2. Ed25519 signature validation (verify signature over chain_hash bytes)
 * 3. Merkle proof inclusion (deferred - requires S3 access)
 *
 * Uses ClickHouse for bundle data and Postgres for signing key lookup.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import { eq } from "drizzle-orm";
import { signingKeys } from "../../db/schema/auth";
import {
  encodeCursor,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../shared/utilities";
import type {
  VerificationResult,
  VerificationStep,
  EvidenceBundleRow,
  EvidenceBundleListItem,
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
].join(", ");

// ---------------------------------------------------------------------------
// Helper: hex decode
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// EvidenceVerificationService
// ---------------------------------------------------------------------------

export class EvidenceVerificationService {
  private clickhouse: ClickHouseClient;
  private db: any;

  constructor(clickhouse: ClickHouseClient, db: any) {
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
    departmentIds?: string[]
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
        "(timestamp < {cursor_ts:DateTime64(3)} OR (timestamp = {cursor_ts:DateTime64(3)} AND bundle_id < {cursor_id:String}))"
      );
      params.cursor_ts = new Date(c.timestamp).toISOString();
      params.cursor_id = c.id;
    }

    // Department scoping
    if (departmentIds && departmentIds.length > 0) {
      conditions.push("department IN {dept_ids:Array(String)}");
      params.dept_ids = departmentIds;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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
            items[items.length - 1].bundle_id
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
              name: "Merkle Proof",
              passed: null,
              details: { reason: "Bundle not found" },
            },
          ],
          overall: "fail",
        });
        continue;
      }

      const steps: VerificationStep[] = [];

      // Step 1: Hash chain linkage verification
      const chainStep = await this.verifyHashChain(bundle);
      steps.push(chainStep);

      // Step 2: Ed25519 signature verification
      const sigStep = await this.verifySignature(bundle);
      steps.push(sigStep);

      // Step 3: Merkle proof (deferred)
      steps.push({
        name: "Merkle Proof",
        passed: null,
        details: {
          reason: "Merkle root storage not yet available",
          note: "Merkle anchors are stored in S3; control plane lacks S3 access. Future enhancement: merkle_anchors Postgres table.",
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
  private async fetchBundles(
    bundleIds: string[]
  ): Promise<Map<string, EvidenceBundleRow>> {
    if (bundleIds.length === 0) return new Map();

    const resultSet = await this.clickhouse.query({
      query: `SELECT ${EVIDENCE_COLUMNS} FROM evidence_bundles WHERE bundle_id IN {ids:Array(String)}`,
      format: "JSONEachRow",
      query_params: { ids: bundleIds },
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
    sequenceNumber: number
  ): Promise<EvidenceBundleRow | null> {
    if (sequenceNumber <= 0) return null;

    const resultSet = await this.clickhouse.query({
      query: `SELECT ${EVIDENCE_COLUMNS} FROM evidence_bundles WHERE kernel_id = {kernel_id:String} AND sequence_number = {seq:UInt64} LIMIT 1`,
      format: "JSONEachRow",
      query_params: {
        kernel_id: kernelId,
        seq: sequenceNumber - 1,
      },
    });

    const rows: EvidenceBundleRow[] = await resultSet.json();
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Step 1: Verify hash chain linkage.
   * Check that previous_hash of the current bundle matches chain_hash of predecessor.
   */
  private async verifyHashChain(
    bundle: EvidenceBundleRow
  ): Promise<VerificationStep> {
    const seqNum =
      typeof bundle.sequence_number === "string"
        ? parseInt(bundle.sequence_number, 10)
        : bundle.sequence_number;

    // First bundle in chain -- previous_hash should be zeros or empty
    if (seqNum === 0) {
      const isGenesisValid =
        bundle.previous_hash === "" ||
        bundle.previous_hash ===
          "0000000000000000000000000000000000000000000000000000000000000000";

      return {
        name: "Hash Chain",
        passed: isGenesisValid,
        details: {
          bundle_id: bundle.bundle_id,
          sequence_number: String(seqNum),
          previous_hash: bundle.previous_hash,
          status: isGenesisValid
            ? "Genesis bundle (first in chain)"
            : "Genesis bundle has unexpected previous_hash",
          chain_hash: bundle.chain_hash,
        },
      };
    }

    // Fetch predecessor
    const predecessor = await this.fetchPredecessor(
      bundle.kernel_id,
      seqNum
    );

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

    const chainValid = bundle.previous_hash === predecessor.chain_hash;

    return {
      name: "Hash Chain",
      passed: chainValid,
      details: {
        bundle_id: bundle.bundle_id,
        sequence_number: String(seqNum),
        previous_hash: bundle.previous_hash,
        predecessor_chain_hash: predecessor.chain_hash,
        predecessor_bundle_id: predecessor.bundle_id,
        predecessor_sequence: String(seqNum - 1),
        match: chainValid ? "true" : "false",
      },
    };
  }

  /**
   * Step 2: Verify Ed25519 signature.
   * The evidence collector signs chain_hash bytes with Ed25519.
   */
  private async verifySignature(
    bundle: EvidenceBundleRow
  ): Promise<VerificationStep> {
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
      const messageBytes = hexToBytes(bundle.chain_hash);
      const publicKeyBytes = hexToBytes(publicKeyHex);

      // Import public key as Ed25519 CryptoKey
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        publicKeyBytes,
        { name: "Ed25519" },
        false,
        ["verify"]
      );

      // Verify signature
      const valid = await crypto.subtle.verify(
        "Ed25519",
        cryptoKey,
        signatureBytes,
        messageBytes
      );

      return {
        name: "Ed25519 Signature",
        passed: valid,
        details: {
          signing_key_id: bundle.signing_key_id,
          public_key_hex: publicKeyHex,
          signature_hex: bundle.signature.substring(0, 32) + "...",
          chain_hash: bundle.chain_hash,
          valid: valid ? "true" : "false",
        },
      };
    } catch (err: any) {
      return {
        name: "Ed25519 Signature",
        passed: false,
        details: {
          signing_key_id: bundle.signing_key_id,
          public_key_hex: publicKeyHex,
          error: `Verification error: ${err.message}`,
        },
      };
    }
  }
}
