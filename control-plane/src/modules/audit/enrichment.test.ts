/**
 * Audit Enrichment - Tests
 *
 * Tests for batch enrichment of ClickHouse audit records with
 * PostgreSQL metadata (user display names, vendor display names, policy names).
 */

import { describe, test, expect, mock } from "bun:test";
import { enrichAuditRecords } from "./enrichment";
import type { ClickHouseAuditRow } from "./model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ClickHouseAuditRow> = {}): ClickHouseAuditRow {
  return {
    timestamp: "2026-02-28T12:00:00.000Z",
    bundle_id: "bundle-001",
    kernel_id: "kernel-01",
    actor_identity: "alice@example.com",
    department: "engineering",
    vendor: "openai",
    model: "gpt-4",
    prompt_hash: "abc123",
    response_hash: "def456",
    policy_action: "allow",
    policy_rules_json: JSON.stringify([{ policy_id: "pol-001", rule: "data.pci.allow" }]),
    token_count: 100,
    enforcement_latency_us: 500,
    chain_hash: "chain001",
    previous_hash: "prev000",
    sequence_number: 1,
    signature: "sig001",
    signing_key_id: "key-01",
    dev_signed: 0,
    schema_version: 1,
    event_date: "2026-02-28",
    ...overrides,
  };
}

/**
 * Create a mock Drizzle-like db that can answer batch queries.
 * The mock intercepts select().from().where() chains.
 */
function createMockDb(options: {
  users?: Array<{ email: string; displayName: string }>;
  vendors?: Array<{ name: string; displayName: string }>;
  policies?: Array<{ id: string; name: string }>;
} = {}) {
  const { users = [], vendors = [], policies = [] } = options;

  // Build a simple mock that handles the chaining pattern:
  // db.select({...}).from(table).where(inArray(column, values))
  const mockDb = {
    select: mock((fields: Record<string, unknown>) => {
      return {
        from: (table: unknown) => {
          return {
            where: async (_condition: unknown) => {
              // Determine which table by inspecting the fields
              if ("email" in fields && "displayName" in fields) {
                return users.map(u => ({ email: u.email, displayName: u.displayName }));
              }
              if ("name" in fields && "displayName" in fields) {
                return vendors.map(v => ({ name: v.name, displayName: v.displayName }));
              }
              if ("id" in fields && "name" in fields) {
                return policies.map(p => ({ id: p.id, name: p.name }));
              }
              return [];
            },
          };
        },
      };
    }),
  };

  return mockDb as any;
}

// ---------------------------------------------------------------------------
// enrichAuditRecords
// ---------------------------------------------------------------------------

describe("enrichAuditRecords", () => {
  test("batch-fetches policy names, user names, vendor names for a page of results", async () => {
    const rows = [
      makeRow({
        actor_identity: "alice@example.com",
        vendor: "openai",
        policy_rules_json: JSON.stringify([{ policy_id: "pol-001", rule: "data.pci.allow" }]),
      }),
      makeRow({
        actor_identity: "bob@example.com",
        vendor: "anthropic",
        bundle_id: "bundle-002",
        policy_rules_json: JSON.stringify([{ policy_id: "pol-002", rule: "data.gdpr.check" }]),
      }),
    ];

    const mockDb = createMockDb({
      users: [
        { email: "alice@example.com", displayName: "Alice Smith" },
        { email: "bob@example.com", displayName: "Bob Jones" },
      ],
      vendors: [
        { name: "openai", displayName: "OpenAI" },
        { name: "anthropic", displayName: "Anthropic" },
      ],
      policies: [
        { id: "pol-001", name: "PCI DSS Policy" },
        { id: "pol-002", name: "GDPR Compliance" },
      ],
    });

    const enriched = await enrichAuditRecords(mockDb, rows);

    expect(enriched).toHaveLength(2);
    // First record
    expect(enriched[0].actor_display_name).toBe("Alice Smith");
    expect(enriched[0].vendor_display_name).toBe("OpenAI");
    expect(enriched[0].policy_rules).toEqual([
      { policy_id: "pol-001", rule: "data.pci.allow", policy_name: "PCI DSS Policy" },
    ]);
    // Second record
    expect(enriched[1].actor_display_name).toBe("Bob Jones");
    expect(enriched[1].vendor_display_name).toBe("Anthropic");
    expect(enriched[1].policy_rules).toEqual([
      { policy_id: "pol-002", rule: "data.gdpr.check", policy_name: "GDPR Compliance" },
    ]);
  });

  test("handles missing references gracefully (deleted policies, unknown users)", async () => {
    const rows = [
      makeRow({
        actor_identity: "unknown@example.com",
        vendor: "deleted-vendor",
        policy_rules_json: JSON.stringify([{ policy_id: "deleted-pol", rule: "data.old.rule" }]),
      }),
    ];

    // Empty db results - all references missing
    const mockDb = createMockDb({
      users: [],
      vendors: [],
      policies: [],
    });

    const enriched = await enrichAuditRecords(mockDb, rows);

    expect(enriched).toHaveLength(1);
    // Missing user -> falls back to raw actor_identity
    expect(enriched[0].actor_display_name).toBeNull();
    // Missing vendor -> falls back to null
    expect(enriched[0].vendor_display_name).toBeNull();
    // Missing policy -> keeps raw rule without policy_name
    expect(enriched[0].policy_rules).toEqual([
      { policy_id: "deleted-pol", rule: "data.old.rule", policy_name: null },
    ]);
  });

  test("handles empty result set", async () => {
    const mockDb = createMockDb();
    const enriched = await enrichAuditRecords(mockDb, []);
    expect(enriched).toHaveLength(0);
  });

  test("deduplicates lookups for repeated values", async () => {
    const rows = [
      makeRow({ actor_identity: "alice@example.com", vendor: "openai" }),
      makeRow({ actor_identity: "alice@example.com", vendor: "openai", bundle_id: "bundle-002" }),
    ];

    const mockDb = createMockDb({
      users: [{ email: "alice@example.com", displayName: "Alice" }],
      vendors: [{ name: "openai", displayName: "OpenAI" }],
      policies: [],
    });

    const enriched = await enrichAuditRecords(mockDb, rows);

    expect(enriched).toHaveLength(2);
    // Both should have the same enriched values
    expect(enriched[0].actor_display_name).toBe("Alice");
    expect(enriched[1].actor_display_name).toBe("Alice");
    // DB should have been called 3 times total (users, vendors, policies) not 6
    expect(mockDb.select).toHaveBeenCalledTimes(3);
  });
});
