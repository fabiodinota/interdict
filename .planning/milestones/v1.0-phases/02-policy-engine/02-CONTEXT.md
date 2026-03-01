# Phase 2: Policy Engine - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The kernel evaluates intercepted AI traffic against policies using a 3-layer pipeline (Layer 1: Wasm/Regorus deterministic rules, Layer 2: NLP classifier for intent/risk, Layer 3: human review queue) and enforces block/allow/redact verdicts on requests and responses. This phase delivers the complete policy evaluation engine integrated into the proxy from Phase 1. Policy authoring UI, per-department/user configuration, and dashboard are separate phases.

**Dependencies:** Phase 1 (Kernel Proxy Foundation) — assumes working CONNECT tunnel, TLS interception, HTTP/SSE proxying, and vendor allowlist middleware.
**Deliverables:**
  - Integrated 3-layer policy pipeline in the kernel crate
  - Verdict enforcement on intercepted traffic (block/allow/redact)
  - Human review queue with persistence and API
  - Vendor allowlist refactored from standalone middleware into a policy verdict

</domain>

<decisions>
## Implementation Decisions

### Verdict behavior & redaction
- Redaction uses **category-tagged placeholders** (e.g. `[REDACTED:SSN]`, `[REDACTED:EMAIL]`) so downstream consumers and auditors can see what type of content was removed
- Block responses are **configurable per policy** — policy author decides whether the 403 response includes detailed reason (policy_id, reason category, human-readable message) or is opaque ("Request blocked by policy")
- Redaction applies to **both directions by default** (outbound prompts and inbound AI responses), but is **configurable per policy** to apply to one direction only
- Original pre-redaction content: **SHA-256 hash always stored** in evidence for verification; **full plaintext storage is configurable per enterprise** (some regulations require it, others prohibit it — per EVID-06). Auditors can always verify what was redacted via hash; plaintext access depends on enterprise config

### Pipeline escalation logic
- When Layer 1 Rego rules return **no match** (neither explicit allow/block/redact), the request **escalates to Layer 2** NLP classifier
- Layer 2 NLP model has a dedicated **'uncertain/review' output class** that triggers escalation to Layer 3 human queue — not a confidence threshold
- When Layer 1 returns an **explicit verdict**, it is enforced immediately; **Layer 2 runs in background by default** for analytics/audit enrichment (classification data logged alongside the verdict). Background L2 can be disabled per policy for performance-critical paths
- Layer 3 escalations include **full pipeline trace** (L1 result, L2 classification, request context) so the human reviewer has sufficient context to decide
- Layer errors (Wasm panic, model load failure) use the **policy's fail-closed/fail-open setting** to determine behavior — consistent error handling model across the pipeline

### Policy conflict resolution
- When multiple policies match the same request, **most restrictive verdict wins** — if any policy says block, it's blocked; redact beats allow
- **All matching policies are evaluated** and verdicts merged — no short-circuiting on block — needed for complete audit trail
- Overlapping redaction verdicts merge as a **union of all redactions** — every field/pattern any policy wants redacted gets redacted (additive)
- **Full verdict trace always generated** — every verdict includes which policies matched, each individual verdict, and the merge result — stored in evidence

### Human review queue contract
- When a request escalates to Layer 3, the **user's connection is held** (blocked) until a human reviewer decides or timeout expires
- **Short timeout (30-60 seconds)** — user's connection can't wait indefinitely
- On timeout with no human decision, the **policy's fail-mode applies** — fail-closed blocks, fail-open allows — consistent with error handling behavior
- Queue is built as a **full queue with database-backed persistence** and API, ready for dashboard integration in later phases
- Queue messages include **request_id, full pipeline trace, and pre-redaction content hash** for reviewer context and audit correlation

### Claude's Discretion
- Wasm module loading and caching strategy
- NLP model warm-up and inference optimization
- Queue persistence backend choice (embedded DB vs external)
- Internal data structures for verdict representation
- Background L2 execution threading model

</decisions>

<specifics>
## Specific Ideas

- Vendor allowlist from Phase 1 should become a policy verdict in the pipeline, not a separate code path (explicit success criterion)
- Evidence log stores original pre-redaction content — this ties into Phase 4 (Evidence Collector) but the data must be captured here at redaction time
- The 3-layer pipeline is the core differentiator: deterministic rules for clear-cut cases, NLP for gray areas, humans for genuinely ambiguous cases

</specifics>

<deferred>
## Deferred Ideas

- Per-department/per-user policy configuration — Phase 6 (Policy Distribution & Kernel Integration)
- Policy authoring and management UI — Phase 8 (Dashboard Core)
- Human review queue dashboard/UI — Phase 8/9 (Dashboard phases)
- Policy versioning and rollback — future consideration

</deferred>

---

*Phase: 02-policy-engine*
*Context gathered: 2026-02-26*
