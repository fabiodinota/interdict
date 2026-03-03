# Phase 11: Advanced Dashboard Views - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Four advanced dashboard views extending the Phase 9 Next.js dashboard: (1) Evidence Verification UI for auditors to independently verify hash chain, signatures, and Merkle proofs, (2) Human Review Queue for Layer 3 escalation management with SLA timers, (3) Department Policy Management for department managers to view and override inherited policies, (4) Anomaly Detection alerts showing statistical deviations against baselines. All views consume existing or new control plane API endpoints.

</domain>

<decisions>
## Implementation Decisions

### Evidence Verification UX
- Dedicated "Evidence Verification" page in sidebar nav, plus inline quick-verify button on individual audit trail records
- Full three-layer verification displayed distinctly: (1) Hash chain integrity (prev_hash links), (2) Ed25519 signature validity, (3) Merkle proof against hourly root — each with its own pass/fail indicator
- Batch verification supported: checkbox selection for multiple bundles with summary results table, plus single-bundle detail view with full cryptographic detail
- Results displayed as vertical stepper/checklist: green check / red X per step, each step expandable to show raw hashes and signatures for technical auditors

### Human Review Queue Workflow
- Mandatory reasoning on approve/reject: dropdown category selector (False positive, Policy violation confirmed, Needs policy update, Insufficient context) plus free-text detail field
- SLA timers with visual warnings: yellow at 75% of SLA, red at 100%. After SLA expiry, item auto-escalates to next role up (Compliance Officer -> Super Admin)
- Full interaction content visible to reviewers: original prompt (or prompt hash with reveal option), AI response (potentially redacted), triggering policy, and risk score
- Shared queue model: all compliance officers see the same queue sorted by SLA urgency, first to click "Review" claims item (optimistic locking). Suitable for pilot scale (~80 users)

### Department Policy Overrides
- Override granularity: enable/disable only — department managers can toggle inherited policies on/off but cannot modify policy parameters. Full parameter editing stays with Policy Admin+ role
- Inheritance display: policy list table with source labels — each row shows policy name, source ("Global" or "Department override"), status (enabled/disabled), and whether it differs from global default
- Override-only model: department managers cannot create department-local policies. Creating new policies requires Policy Admin+ role. Keeps policy creation centralized
- Lockable mandatory policies: compliance officers can mark policies as "mandatory" — department managers see them but cannot disable them. Critical for regulatory policies (PII detection, GDPR rules)

### Anomaly Detection Presentation
- Dedicated "Anomalies" page in sidebar nav — separate from dashboard home to avoid noise
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

</decisions>

<specifics>
## Specific Ideas

- Evidence verification stepper should feel like a security audit checklist — clear, authoritative, no ambiguity about pass/fail
- Human review queue should feel urgent — SLA countdown timers should be prominent, color-coded, and impossible to miss
- Department policy page should clearly communicate "you can turn things off, but you can't change how they work" — set expectations for department managers
- Anomaly alerts with baseline numbers build trust in the detection system — compliance officers need to understand WHY something is flagged, not just THAT it's flagged

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dashboard/src/components/ui/`: Full shadcn/ui library (badge, button, card, dialog, table, tabs, tooltip, skeleton, etc.)
- `dashboard/src/components/audit/AuditTable.tsx` + `AuditFilters.tsx`: TanStack Table with cursor pagination — pattern reusable for review queue and evidence list
- `dashboard/src/components/dashboard/KpiCards.tsx`: KPI card pattern reusable for anomaly summary cards
- `dashboard/src/hooks/use-audit.ts`: TanStack Query + BFF proxy pattern — reusable for all new data fetching hooks
- `dashboard/src/lib/api.ts`: API client with BFF proxy routing
- `dashboard/src/types/api.ts`: Typed API response shapes (ApiResponse<T>, PaginatedResponse<T>, AuditRecord with `decision: "escalate"`)
- Recharts already installed for chart components — reusable for anomaly trend charts

### Established Patterns
- BFF proxy: all API calls route through `/api/proxy/[...path]` which injects Bearer token from httpOnly cookie
- TanStack Table for data tables with server-side cursor pagination
- TanStack Query for data fetching with 30s polling for stats
- Sidebar nav with icon + label links — new pages follow same pattern
- shadcn/ui Dialog for confirmations, Sonner for toast notifications

### Integration Points
- Evidence collector (Rust): `crates/evidence-collector/src/` — hash chain (`chain/signer.rs`), Ed25519 signing (`signing/`), Merkle tree (`merkle/builder.rs`), key rotation (`signing/rotation.rs`)
- Control plane API: needs new endpoints for evidence verification, review queue CRUD, department policy overrides, anomaly queries
- ClickHouse: audit data already stored — anomaly queries run against existing `audit_events` table
- AuditRecord type already has `decision: "escalate"` — Layer 3 escalations identifiable in existing data
- Dashboard sidebar (`dashboard/src/components/layout/`): add new nav items for Evidence Verification, Review Queue, Anomalies, Department Policies

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-advanced-dashboard-views*
*Context gathered: 2026-03-03*
