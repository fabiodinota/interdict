/**
 * Audit Record Enrichment
 *
 * Batch enrichment of ClickHouse audit records with PostgreSQL metadata:
 * - User display names (from users table by email/actor_identity)
 * - Vendor display names (from vendors table by name)
 * - Policy names (from policies table by ID extracted from policy_rules_json)
 *
 * Per Pitfall 7: all lookups are batched (NOT N+1 per-row).
 * Entity lookups are cached in a simple Map for reuse within the same request.
 */

import { inArray } from "drizzle-orm";
import { policies, users, vendors } from "../../db/schema/index";
import type { AppDb } from "../../shared/types";
import type { AuditRecord, ClickHouseAuditRow } from "./model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PolicyRuleEntry {
  policy_id?: string;
  rule?: string;
  [key: string]: unknown;
}

interface EnrichedPolicyRule {
  policy_id: string | null;
  rule: string | null;
  policy_name: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// enrichAuditRecords
// ---------------------------------------------------------------------------

/**
 * Enrich a page of ClickHouse audit records with PostgreSQL metadata.
 *
 * 1. Extract unique actor_identity values, vendor names, and policy IDs
 * 2. Batch-query PostgreSQL for each entity type
 * 3. Map enrichments back onto each row with raw value as fallback
 *
 * @param db - Drizzle ORM database instance
 * @param rows - Raw ClickHouse audit rows
 * @returns Enriched audit records with display names
 */
export async function enrichAuditRecords(
  db: AppDb,
  rows: ClickHouseAuditRow[],
): Promise<AuditRecord[]> {
  if (rows.length === 0) {
    return [];
  }

  // --- Step 1: Extract unique values ---
  const uniqueActors = new Set<string>();
  const uniqueVendors = new Set<string>();
  const uniquePolicyIds = new Set<string>();

  for (const row of rows) {
    uniqueActors.add(row.actor_identity);
    uniqueVendors.add(row.vendor);

    // Parse policy_rules_json to extract policy IDs
    const rules = safeParsePolicyRules(row.policy_rules_json);
    for (const rule of rules) {
      if (rule.policy_id) {
        uniquePolicyIds.add(rule.policy_id);
      }
    }
  }

  // --- Step 2: Batch-query PostgreSQL ---
  const [userMap, vendorMap, policyMap] = await Promise.all([
    batchLookupUsers(db, Array.from(uniqueActors)),
    batchLookupVendors(db, Array.from(uniqueVendors)),
    batchLookupPolicies(db, Array.from(uniquePolicyIds)),
  ]);

  // --- Step 3: Map enrichments onto rows ---
  return rows.map((row) => {
    const rules = safeParsePolicyRules(row.policy_rules_json);
    const enrichedRules: EnrichedPolicyRule[] = rules.map((r) => ({
      ...r,
      policy_id: r.policy_id ?? null,
      rule: r.rule ?? null,
      policy_name: r.policy_id ? (policyMap.get(r.policy_id) ?? null) : null,
    }));

    return {
      timestamp: row.timestamp,
      bundle_id: row.bundle_id,
      kernel_id: row.kernel_id,
      actor_identity: row.actor_identity,
      actor_display_name: userMap.get(row.actor_identity) ?? null,
      department: row.department,
      department_display_name: null,
      vendor: row.vendor,
      vendor_display_name: vendorMap.get(row.vendor) ?? null,
      model: row.model,
      policy_action: row.policy_action,
      policy_rules: enrichedRules,
      token_count: row.token_count,
      enforcement_latency_us: row.enforcement_latency_us,
      chain_hash: row.chain_hash,
      prompt_hash: row.prompt_hash,
      response_hash: row.response_hash,
    };
  });
}

// ---------------------------------------------------------------------------
// Batch lookup helpers
// ---------------------------------------------------------------------------

/**
 * Batch-fetch user display names by email.
 * Returns Map<email, displayName>.
 */
async function batchLookupUsers(db: AppDb, emails: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (emails.length === 0) return map;

  const rows = await db
    .select({ email: users.email, displayName: users.displayName })
    .from(users)
    .where(inArray(users.email, emails));

  for (const row of rows) {
    map.set(row.email, row.displayName);
  }
  return map;
}

/**
 * Batch-fetch vendor display names by vendor name.
 * Returns Map<name, displayName>.
 */
async function batchLookupVendors(db: AppDb, names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (names.length === 0) return map;

  const rows = await db
    .select({ name: vendors.name, displayName: vendors.displayName })
    .from(vendors)
    .where(inArray(vendors.name, names));

  for (const row of rows) {
    map.set(row.name, row.displayName);
  }
  return map;
}

/**
 * Batch-fetch policy names by policy ID.
 * Returns Map<id, name>.
 */
async function batchLookupPolicies(db: AppDb, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const rows = await db
    .select({ id: policies.id, name: policies.name })
    .from(policies)
    .where(inArray(policies.id, ids));

  for (const row of rows) {
    map.set(row.id, row.name);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse policy_rules_json from ClickHouse.
 * Returns empty array if parsing fails.
 */
function safeParsePolicyRules(json: string): PolicyRuleEntry[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: unknown) {
    console.warn("[audit] malformed policy_rules_json during enrichment", {
      error: error instanceof Error ? error.message : String(error),
      length: json.length,
    });
    return [];
  }
}
