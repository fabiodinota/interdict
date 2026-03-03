# Phase 11: Advanced Dashboard Views - Research

**Researched:** 2026-03-03
**Domain:** Next.js 15 dashboard views, ClickHouse anomaly queries, Ed25519 verification, RBAC-scoped UI
**Confidence:** HIGH

## Summary

Phase 11 adds four advanced dashboard views to the existing Next.js 15 + shadcn/ui dashboard (Phase 9): Evidence Verification, Human Review Queue, Department Policy Management, and Anomaly Detection. All four views are frontend-heavy but require new control plane API endpoints (Elysia/Bun) and, for anomaly detection, new ClickHouse queries against the existing `evidence_bundles` table and materialized views.

The existing codebase provides strong foundations: TanStack Table for data tables, TanStack Query for data fetching, BFF proxy pattern for auth, shadcn/ui component library, Recharts for charts, and a well-structured Elysia module pattern on the control plane. The ClickHouse schema already stores `chain_hash`, `previous_hash`, `sequence_number`, `signature`, `signing_key_id`, and `policy_action` (including `escalate` decisions), and the signing keys registry (`signing_keys` table in Postgres) stores public keys needed for Ed25519 verification.

**Primary recommendation:** Build four new dashboard pages following existing patterns (BFF proxy, TanStack hooks, Elysia modules), with verification logic running server-side on the control plane (not browser-side) to keep signing key access centralized and avoid shipping crypto libraries to the client.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Evidence Verification UX:**
- Dedicated "Evidence Verification" page in sidebar nav, plus inline quick-verify button on individual audit trail records
- Full three-layer verification displayed distinctly: (1) Hash chain integrity (prev_hash links), (2) Ed25519 signature validity, (3) Merkle proof against hourly root -- each with its own pass/fail indicator
- Batch verification supported: checkbox selection for multiple bundles with summary results table, plus single-bundle detail view with full cryptographic detail
- Results displayed as vertical stepper/checklist: green check / red X per step, each step expandable to show raw hashes and signatures for technical auditors

**Human Review Queue Workflow:**
- Mandatory reasoning on approve/reject: dropdown category selector (False positive, Policy violation confirmed, Needs policy update, Insufficient context) plus free-text detail field
- SLA timers with visual warnings: yellow at 75% of SLA, red at 100%. After SLA expiry, item auto-escalates to next role up (Compliance Officer -> Super Admin)
- Full interaction content visible to reviewers: original prompt (or prompt hash with reveal option), AI response (potentially redacted), triggering policy, and risk score
- Shared queue model: all compliance officers see the same queue sorted by SLA urgency, first to click "Review" claims item (optimistic locking). Suitable for pilot scale (~80 users)

**Department Policy Overrides:**
- Override granularity: enable/disable only -- department managers can toggle inherited policies on/off but cannot modify policy parameters. Full parameter editing stays with Policy Admin+ role
- Inheritance display: policy list table with source labels -- each row shows policy name, source ("Global" or "Department override"), status (enabled/disabled), and whether it differs from global default
- Override-only model: department managers cannot create department-local policies. Creating new policies requires Policy Admin+ role. Keeps policy creation centralized
- Lockable mandatory policies: compliance officers can mark policies as "mandatory" -- department managers see them but cannot disable them. Critical for regulatory policies (PII detection, GDPR rules)

**Anomaly Detection Presentation:**
- Dedicated "Anomalies" page in sidebar nav -- separate from dashboard home to avoid noise
- Each alert shows baseline context: what the baseline was (e.g., "Normal: 50 requests/hour, Observed: 200 requests/hour") so compliance officer understands why it's flagged
- Three severity levels: Info (notable, ~20% above baseline), Warning (significant, ~2x baseline), Critical (extreme, ~5x baseline or multi-factor combo like off-hours + high volume). Color-coded badges
- Actionable alerts: each alert has suggested action quick-links ("View audit trail for this user", "Review department policies", "Investigate vendor usage") that navigate to the relevant filtered view

### Claude's Discretion
- Verification API design (new endpoints on control plane or direct evidence collector query)
- Review queue API endpoint design and database schema
- Department policy override storage model (separate table vs policy metadata)
- Anomaly detection algorithm specifics (statistical baseline calculation, time windows, thresholds)
- ClickHouse query patterns for anomaly detection
- Exact component structure and file organization for all four views
- Loading states, error handling, empty states for each view
- SLA timer default values and configuration approach

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-07 | Auditor can independently verify evidence bundle hash chain integrity, Ed25519 signatures, and Merkle proofs through an Evidence Verification UI | Verification API on control plane using existing `signing_keys` table + ClickHouse `evidence_bundles` columns (chain_hash, previous_hash, signature, signing_key_id). Three-step verification stepper UI. |
| DASH-08 | Compliance officer can review, approve, or reject Layer 3 escalated AI interactions through a Human Review Queue with configurable SLA timers | New `review_items` Postgres table for queue state. Filter ClickHouse for `policy_action = 'escalate'` records. Optimistic locking via `claimed_by`/`claimed_at` columns. SLA countdown with `date-fns` differenceInSeconds. |
| DASH-09 | Department Manager can view and override inherited policies for their department through a Department Policy Management UI | New `department_policy_overrides` Postgres table (department_id, policy_id, enabled, mandatory). RBAC scoped to `department:manage` permission. Toggle-only UI with mandatory lock indicators. |
| DASH-10 | Compliance officer can view anomaly detection alerts (volume spikes, off-hours usage, vendor switching, topic drift) based on statistical baselines | ClickHouse aggregate queries comparing current-window vs baseline-window metrics. Server-side anomaly computation on control plane. Severity thresholds: Info (1.2x), Warning (2x), Critical (5x). |

</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^15 | Dashboard framework | Already in use (Phase 9), App Router with standalone output |
| TanStack Query | ^5 | Server state management | Already in use for all data fetching with 30s polling |
| TanStack Table | ^8 | Data tables | Already in use for audit trail, cursor pagination |
| shadcn/ui | ^3 | UI components | Already in use -- full library installed |
| Recharts | ^2 | Charts | Already installed for dashboard home charts |
| Elysia | - | Control plane HTTP | Already in use with TypeBox validation |
| date-fns | ^4.1.0 | Date manipulation | Already installed -- use for SLA timer calculations |
| lucide-react | ^0.575.0 | Icons | Already installed |
| sonner | ^2 | Toast notifications | Already installed |
| Drizzle ORM | - | Postgres queries | Already in use for all control plane DB access |
| @clickhouse/client | - | ClickHouse queries | Already in use for audit queries |

### Supporting (No New Dependencies Needed)
No additional npm packages required. All four views can be built with the existing dependency set. The `ed25519-dalek` verification in Rust is not needed because verification runs server-side on the control plane (TypeScript), and the `@noble/ed25519` npm package or a simple WebCrypto Ed25519 verify would be needed on the control plane.

### New Control Plane Dependency
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @noble/ed25519 | ^2 | Ed25519 signature verification in TypeScript | Control plane verification endpoint for DASH-07 |

**Note:** Bun supports `crypto.subtle` with Ed25519 (via Web Crypto API). Verify at implementation time whether `crypto.subtle.verify("Ed25519", ...)` works in Bun -- if so, no extra dependency needed. If not, use `@noble/ed25519` as fallback.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side verification | Browser-side crypto (SubtleCrypto) | Would require shipping public keys to browser; server-side is simpler and keeps key access centralized |
| Separate anomaly service | Inline ClickHouse queries | Inline is simpler for pilot scale; separate service only needed at >1000 users/hour |
| WebSocket for SLA timers | Client-side countdown with periodic sync | Client-side countdown with TanStack Query refetch is simpler and sufficient for ~80 users |

**Installation:**
```bash
# Likely no installation needed if Bun WebCrypto supports Ed25519
# Fallback only:
cd control-plane && bun add @noble/ed25519
```

## Architecture Patterns

### Recommended Project Structure
```
dashboard/src/
  app/(dashboard)/
    evidence/           # DASH-07: Evidence Verification page
      page.tsx
    reviews/            # DASH-08: Human Review Queue page
      page.tsx
    department-policies/ # DASH-09: Department Policy Management page
      page.tsx
    anomalies/          # DASH-10: Anomaly Detection page
      page.tsx
  components/
    evidence/           # Evidence verification components
      VerificationStepper.tsx
      BatchVerifyTable.tsx
      BundleDetailPanel.tsx
    reviews/            # Review queue components
      ReviewQueue.tsx
      ReviewDialog.tsx
      SlaTimer.tsx
    department-policies/ # Department policy components
      PolicyOverrideTable.tsx
      MandatoryBadge.tsx
    anomalies/          # Anomaly detection components
      AnomalyCard.tsx
      AnomalyList.tsx
      BaselineChart.tsx
  hooks/
    use-evidence.ts     # Verification API hooks
    use-reviews.ts      # Review queue hooks
    use-department-policies.ts  # Department policy hooks
    use-anomalies.ts    # Anomaly detection hooks

control-plane/src/
  modules/
    evidence/           # DASH-07: Verification endpoints
      index.ts          # Elysia plugin
      service.ts        # Verification logic
      model.ts          # TypeBox schemas
    reviews/            # DASH-08: Review queue endpoints
      index.ts
      service.ts
      model.ts
    department-overrides/ # DASH-09: Department policy override endpoints
      index.ts
      service.ts
      model.ts
    anomalies/          # DASH-10: Anomaly detection endpoints
      index.ts
      service.ts
      model.ts
      queries.ts        # ClickHouse anomaly queries
  db/schema/
    reviews.ts          # review_items table
    department-overrides.ts  # department_policy_overrides table
```

### Pattern 1: Verification API Design (DASH-07)
**What:** Server-side three-step verification of evidence bundles
**When to use:** Evidence Verification UI calls a single endpoint that returns step-by-step results

The verification endpoint accepts one or more bundle IDs, fetches the bundles from ClickHouse, looks up the signing key from the `signing_keys` Postgres table, and performs:

1. **Hash chain check:** Re-compute `SHA256(previous_hash || bundle_content)` and compare to `chain_hash`
2. **Signature check:** Verify `signature` against bundle content using the public key from `signing_keys` where `key_id = signing_key_id`
3. **Merkle proof check:** Verify bundle's chain_hash is included in the hourly Merkle root (requires Merkle root storage -- currently anchored to S3 via `S3Anchor`)

```typescript
// Control plane verification service pattern
interface VerificationResult {
  bundleId: string;
  hashChain: { passed: boolean; expected: string; actual: string; previousHash: string };
  signature: { passed: boolean; keyId: string; publicKeyHex: string; signatureHex: string };
  merkleProof: { passed: boolean; merkleRoot: string; hour: string } | { passed: null; reason: string };
  overall: "pass" | "fail" | "partial";
}
```

**Key detail:** The ClickHouse `evidence_bundles` table stores `chain_hash`, `previous_hash`, `sequence_number`, `signature`, `signing_key_id` as strings (hex-encoded). The `signing_keys` Postgres table stores `public_key_hex` for each `key_id`. The chain hash algorithm is `SHA256(previous_hash_bytes || bundle_content_bytes)` per `chain/hasher.rs`.

**Merkle proof limitation:** The current `HourlyMerkleBuilder` only stores roots (via S3 anchoring), not individual proofs. For full Merkle proof verification, the control plane would need to either: (a) reconstruct the tree from all bundles in that hour window, or (b) store proof paths at write time. Recommendation: reconstruct from ClickHouse data for the hour window (feasible at pilot scale).

### Pattern 2: Optimistic Locking for Review Queue (DASH-08)
**What:** Shared queue where first reviewer to claim an item locks it
**When to use:** Multiple compliance officers viewing the same queue

```typescript
// Postgres schema for review_items
export const reviewItems = pgTable("review_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  bundleId: varchar("bundle_id", { length: 255 }).notNull(),
  escalatedAt: timestamp("escalated_at").notNull(),
  slaDeadline: timestamp("sla_deadline").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending | claimed | approved | rejected | auto_escalated
  claimedBy: uuid("claimed_by").references(() => users.id),
  claimedAt: timestamp("claimed_at"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  resolution: varchar("resolution", { length: 50 }),
    // false_positive | violation_confirmed | needs_policy_update | insufficient_context
  resolutionNotes: text("resolution_notes"),
  autoEscalatedTo: uuid("auto_escalated_to").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Claim with optimistic lock:
// UPDATE review_items SET claimed_by = $1, claimed_at = NOW(), status = 'claimed'
// WHERE id = $2 AND status = 'pending'
// RETURNING *
// If 0 rows affected -> item already claimed, return 409 Conflict
```

**SLA timer approach:** Store `sla_deadline` as absolute timestamp. Default SLA: 4 hours from escalation. Client calculates remaining time with `date-fns` `differenceInSeconds(slaDeadline, now)`. TanStack Query refetch every 30s keeps queue fresh. Color thresholds: >25% remaining = normal, <=25% = yellow, <=0% = red.

**Auto-escalation:** A periodic check (cron-like) on the control plane queries `review_items WHERE status = 'pending' AND sla_deadline < NOW()` and updates status to `auto_escalated`. For pilot scale, this can be a simple `setInterval` in the Elysia server startup.

### Pattern 3: Department Policy Overrides (DASH-09)
**What:** Separate table tracking department-level policy enable/disable overrides
**When to use:** Department managers toggling inherited policies

```typescript
export const departmentPolicyOverrides = pgTable(
  "department_policy_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id").notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id").notNull()
      .references(() => policies.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(), // The override value
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dept_policy_override_unique").on(table.departmentId, table.policyId),
  ]
);

// Mandatory policy flag: add to policies table
// ALTER TABLE policies ADD COLUMN is_mandatory BOOLEAN NOT NULL DEFAULT false;
```

**Effective policy resolution:** For a given department, the effective policy list is: all global policies, with `enabled` status overridden by `department_policy_overrides` where one exists. If `policies.is_mandatory = true`, the override is ignored (always enabled). The API returns the merged view.

### Pattern 4: Anomaly Detection Queries (DASH-10)
**What:** ClickHouse queries comparing current metrics to baseline windows
**When to use:** Anomaly detection page loads

```sql
-- Volume spike detection: compare last 1 hour to same hour over past 7 days
WITH baseline AS (
  SELECT
    actor_identity,
    avg(hourly_count) AS avg_count,
    stddevPop(hourly_count) AS std_count
  FROM (
    SELECT
      actor_identity,
      toStartOfHour(timestamp) AS hour,
      count() AS hourly_count
    FROM evidence_bundles
    WHERE event_date >= today() - 7
      AND event_date < today()
      AND toHour(timestamp) = toHour(now())
    GROUP BY actor_identity, hour
  )
  GROUP BY actor_identity
),
current_hour AS (
  SELECT
    actor_identity,
    count() AS current_count
  FROM evidence_bundles
  WHERE event_date = today()
    AND timestamp >= toStartOfHour(now())
  GROUP BY actor_identity
)
SELECT
  c.actor_identity,
  c.current_count,
  b.avg_count AS baseline_avg,
  b.std_count AS baseline_std,
  c.current_count / greatest(b.avg_count, 1) AS ratio
FROM current_hour c
JOIN baseline b ON c.actor_identity = b.actor_identity
WHERE c.current_count > b.avg_count * 1.2
ORDER BY ratio DESC
```

**Four anomaly types to implement:**
1. **Volume spikes:** Per-user request count vs 7-day same-hour average
2. **Off-hours usage:** Requests outside business hours (configurable, default 6am-10pm) for users who normally only work in-hours
3. **Vendor switching:** User switching to a different vendor than their usual (>80% of historical requests)
4. **Topic drift:** This requires prompt content analysis which violates Invariant #6 (no plaintext prompts in logs). Implementation: use `prompt_hash` change frequency as a proxy -- rapid unique prompt hash generation may indicate unusual behavior patterns

### Anti-Patterns to Avoid
- **Browser-side Ed25519 verification:** Do not ship signing keys to the browser or perform crypto verification client-side. Keep it server-side on the control plane.
- **Polling ClickHouse for SLA timers:** SLA state lives in Postgres, not ClickHouse. Do not query ClickHouse for review queue state.
- **Full-table scans for anomaly detection:** Always include `event_date` partition filter in ClickHouse queries. Without it, queries scan all 7 years of retained data.
- **Prompt text in anomaly alerts:** Per Invariant #6, never include raw prompts in anomaly detection output. Use hashes and metadata only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ed25519 verification | Custom crypto implementation | WebCrypto `crypto.subtle.verify("Ed25519", ...)` or `@noble/ed25519` | Crypto is easy to get wrong; use audited implementations |
| Merkle tree reconstruction | Custom tree builder | `rs-merkle` SHA256 (same as evidence collector) or JS equivalent | Must match the exact tree algorithm used at write time |
| SLA countdown display | Custom timer with setInterval | `date-fns` differenceInSeconds + TanStack Query refetch | Avoids timer drift and memory leaks from raw setInterval |
| Optimistic locking | Application-level locks | SQL `UPDATE ... WHERE status = 'pending' RETURNING *` | Database-level atomicity is more reliable than app-level checks |
| Statistical baselines | Rolling average in application code | ClickHouse aggregate functions (avg, stddevPop) | ClickHouse processes millions of rows efficiently; JS cannot |

**Key insight:** The control plane already has ClickHouse and Postgres clients. All four views should leverage server-side computation and return pre-computed results to the dashboard, not push raw data to the browser for processing.

## Common Pitfalls

### Pitfall 1: ClickHouse Partition Pruning
**What goes wrong:** Anomaly detection queries without `event_date` filter scan entire 7-year retention window
**Why it happens:** Developers forget that ClickHouse partitions by `toYYYYMMDD(event_date)` and skipping the filter causes full table scans
**How to avoid:** Every ClickHouse query in the anomaly module MUST include `event_date >= X AND event_date <= Y`
**Warning signs:** Query takes >5 seconds or ClickHouse memory usage spikes

### Pitfall 2: Hash Chain Verification Content Mismatch
**What goes wrong:** Verification fails because the "bundle content" used for hashing at write time doesn't match what's reconstructed at read time
**Why it happens:** The `ChainState.link()` in `hasher.rs` hashes `previous_hash || bundle_content`, but `bundle_content` is the serialized bundle bytes, not individual fields
**How to avoid:** The verification endpoint must reconstruct the exact same byte sequence that was hashed. Study `evidence-collector/src/main.rs` or the gRPC handler to understand what `bundle_content` is. Alternatively, trust the `chain_hash` field and verify only that `chain_hash[n]` matches re-computation of `SHA256(chain_hash[n-1] || bundle_content[n])` -- but this requires knowing the content bytes
**Warning signs:** Every bundle fails hash chain verification despite being legitimately written

### Pitfall 3: Merkle Root Availability
**What goes wrong:** Merkle proof verification returns "unavailable" because roots are only stored in S3 and the control plane doesn't have S3 access configured
**Why it happens:** The `S3Anchor` writes Merkle roots to S3. The control plane needs to read them back.
**How to avoid:** Either: (a) give the control plane S3 read access to the Merkle root bucket, or (b) also store Merkle roots in Postgres/ClickHouse at anchor time. Option (b) is recommended -- add a `merkle_roots` table in Postgres
**Warning signs:** Merkle proof step always shows "unavailable" in the verification UI

### Pitfall 4: Review Queue Race Conditions
**What goes wrong:** Two compliance officers both claim the same review item
**Why it happens:** Without atomic locking, both read `status = 'pending'` before either writes the claim
**How to avoid:** Use `UPDATE ... WHERE status = 'pending' RETURNING *` in a single SQL statement. If 0 rows returned, item was already claimed. Return 409 Conflict to the second claimer.
**Warning signs:** Two users both see "Review claimed" for the same item

### Pitfall 5: SLA Timer Timezone Issues
**What goes wrong:** SLA deadlines appear wrong because server and client are in different timezones
**Why it happens:** Storing deadlines as local time or not converting properly
**How to avoid:** Store all timestamps as UTC in Postgres. Client receives UTC and calculates local display using `date-fns` UTC helpers. Countdown is always based on UTC comparison.
**Warning signs:** SLA timers show negative time or hours off from expected

### Pitfall 6: Department Scoping Bypass
**What goes wrong:** Department manager can see/modify policies for departments they don't belong to
**Why it happens:** Frontend checks role but not department membership
**How to avoid:** Server-side enforcement: every department policy override endpoint must verify `user.departmentIds.includes(requestedDepartmentId)`. Use the existing `userDepartments` join table.
**Warning signs:** Department manager can access other departments' data via URL manipulation

## Code Examples

### Evidence Verification Hook
```typescript
// dashboard/src/hooks/use-evidence.ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface VerificationStep {
  name: string;
  passed: boolean | null; // null = not available
  details: Record<string, string>;
}

interface VerificationResult {
  bundleId: string;
  steps: VerificationStep[];
  overall: "pass" | "fail" | "partial";
}

export function useVerifyBundles(bundleIds: string[]) {
  return useMutation({
    mutationFn: () =>
      api<{ success: boolean; data: VerificationResult[] }>("/evidence/verify", {
        method: "POST",
        body: JSON.stringify({ bundle_ids: bundleIds }),
      }),
  });
}
```

### SLA Timer Component Pattern
```typescript
// dashboard/src/components/reviews/SlaTimer.tsx
import { differenceInSeconds } from "date-fns";
import { Badge } from "@/components/ui/badge";

export function SlaTimer({ deadline }: { deadline: string }) {
  const remaining = differenceInSeconds(new Date(deadline), new Date());
  const totalSla = 4 * 3600; // 4 hours default
  const pct = remaining / totalSla;

  const color = remaining <= 0 ? "destructive"
    : pct <= 0.25 ? "warning" // custom variant or className
    : "default";

  const display = remaining <= 0
    ? "EXPIRED"
    : `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`;

  return <Badge variant={color}>{display}</Badge>;
}
```

### Review Claim with Optimistic Lock
```typescript
// control-plane/src/modules/reviews/service.ts
async claimReview(reviewId: string, userId: string): Promise<ReviewItem | null> {
  const result = await this.db
    .update(reviewItems)
    .set({
      claimedBy: userId,
      claimedAt: new Date(),
      status: "claimed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviewItems.id, reviewId),
        eq(reviewItems.status, "pending"),
      )
    )
    .returning();

  return result[0] ?? null; // null = already claimed -> 409
}
```

### Anomaly Detection Query Pattern
```typescript
// control-plane/src/modules/anomalies/queries.ts
export async function queryVolumeAnomalies(
  client: ClickHouseClient,
  thresholds: { info: number; warning: number; critical: number }
): Promise<VolumeAnomaly[]> {
  const result = await client.query({
    query: `
      WITH baseline AS (
        SELECT actor_identity,
               avg(hourly_count) AS avg_count,
               stddevPop(hourly_count) AS std_count
        FROM (
          SELECT actor_identity, toStartOfHour(timestamp) AS hour, count() AS hourly_count
          FROM evidence_bundles
          WHERE event_date >= today() - 7 AND event_date < today()
            AND toHour(timestamp) = toHour(now())
          GROUP BY actor_identity, hour
        ) GROUP BY actor_identity
      ),
      current AS (
        SELECT actor_identity, count() AS current_count
        FROM evidence_bundles
        WHERE event_date = today() AND timestamp >= toStartOfHour(now())
        GROUP BY actor_identity
      )
      SELECT c.actor_identity, c.current_count,
             b.avg_count, b.std_count,
             c.current_count / greatest(b.avg_count, 1) AS ratio
      FROM current c JOIN baseline b ON c.actor_identity = b.actor_identity
      WHERE c.current_count > b.avg_count * {info_threshold:Float64}
      ORDER BY ratio DESC
      LIMIT 100
    `,
    format: "JSONEachRow",
    query_params: { info_threshold: thresholds.info },
  });

  return result.json();
}
```

### Sidebar Navigation Extension
```typescript
// Add to NAV_ITEMS in dashboard/src/components/layout/Sidebar.tsx
import { ShieldCheck, MessageSquareWarning, Building, AlertTriangle } from "lucide-react";

// New items to append:
{ label: "Evidence", icon: ShieldCheck, href: "/evidence" },
{ label: "Reviews", icon: MessageSquareWarning, href: "/reviews" },
{ label: "Dept Policies", icon: Building, href: "/department-policies" },
{ label: "Anomalies", icon: AlertTriangle, href: "/anomalies" },
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser-side crypto verification | Server-side verification via API | Current best practice | Simplifies client, centralizes key access |
| Custom SLA timer with setInterval | Reactive countdown with TanStack Query refetch | TanStack Query v5 | Eliminates timer drift, integrates with data freshness |
| Real-time WebSocket for queue | Polling with 30s TanStack Query refetch | Project decision (CONTEXT.md) | Simpler for ~80 user pilot; WebSocket is v1.2 |

**Relevant project patterns already established:**
- BFF proxy for auth injection (Phase 9)
- TanStack Table with cursor pagination (Phase 9)
- Elysia module pattern with `authPlugin` and `.derive()` (Phase 7/9)
- ClickHouse parameterized queries with partition pruning (Phase 9)

## Open Questions

1. **Bundle content bytes for hash chain reverification**
   - What we know: `ChainState.link()` takes `bundle_content: &[u8]` and computes `SHA256(previous_hash || bundle_content)`
   - What's unclear: What exactly constitutes `bundle_content` -- is it the serialized EvidenceRow, the gRPC message bytes, or something else?
   - Recommendation: Inspect the evidence collector's gRPC handler (`main.rs` or service impl) to find what bytes are passed to `chain_manager.link()`. If the exact reconstruction is complex, consider a simpler verification: verify that sequential bundles from the same `kernel_id` have `previous_hash[n] == chain_hash[n-1]` (chain linkage check without content re-hashing).

2. **Merkle root storage for verification**
   - What we know: `S3Anchor` writes hourly Merkle roots to S3. The control plane has no S3 read access.
   - What's unclear: Whether to add S3 read access to the control plane or store roots in a new Postgres table.
   - Recommendation: Add a `merkle_anchors` Postgres table (hour, root_hex, bundle_count) and have the evidence collector write to both S3 and Postgres. This makes verification queries fast and self-contained.

3. **Topic drift detection without prompt content**
   - What we know: Invariant #6 prohibits logging plaintext prompts. ClickHouse stores `prompt_hash` but not content.
   - What's unclear: How to detect "topic drift" from hashes alone.
   - Recommendation: Use prompt hash entropy as proxy -- if a user generates many unique prompt hashes in a short window (vs their historical pattern of repeated hashes), flag as potential topic drift. This is a weaker signal but respects the invariant.

4. **Escalation source: how do review_items get created?**
   - What we know: `policy_action = 'escalate'` in ClickHouse indicates Layer 3 escalation
   - What's unclear: Whether the evidence collector or kernel creates a review item, or if this needs a new mechanism
   - Recommendation: Add a control plane background job that polls ClickHouse for new `policy_action = 'escalate'` events and creates corresponding `review_items` rows in Postgres. This keeps the data plane unchanged and creates queue items asynchronously.

## Sources

### Primary (HIGH confidence)
- **Project codebase:** `crates/evidence-collector/src/chain/hasher.rs` -- chain hash algorithm (SHA256(prev_hash || content))
- **Project codebase:** `crates/evidence-collector/src/signing/local.rs` -- Ed25519 signing via ed25519-dalek
- **Project codebase:** `crates/evidence-collector/src/merkle/builder.rs` -- rs-merkle SHA256 Merkle tree
- **Project codebase:** `crates/evidence-collector/src/storage/clickhouse.rs` -- evidence_bundles schema DDL
- **Project codebase:** `control-plane/src/db/schema/auth.ts` -- signing_keys table with public_key_hex
- **Project codebase:** `control-plane/src/modules/audit/queries.ts` -- ClickHouse query patterns
- **Project codebase:** `control-plane/src/modules/auth/permissions.ts` -- RBAC permission model
- **Project codebase:** `dashboard/src/hooks/use-audit.ts` -- TanStack Query hook pattern
- **Project codebase:** `dashboard/src/components/layout/Sidebar.tsx` -- nav structure

### Secondary (MEDIUM confidence)
- Ed25519 support in Bun's WebCrypto: Bun documents support for `Ed25519` in `crypto.subtle` -- needs runtime verification
- ClickHouse stddevPop function: documented in ClickHouse aggregate functions reference

### Tertiary (LOW confidence)
- Topic drift detection via prompt hash entropy: novel approach, needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and patterns established
- Architecture: HIGH - follows existing Elysia module + Next.js page patterns exactly
- Verification API: MEDIUM - hash chain content reconstruction needs implementation spike
- Anomaly detection: MEDIUM - ClickHouse query patterns need pilot-scale performance validation
- Pitfalls: HIGH - based on direct codebase analysis

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable -- all dependencies are already locked)
