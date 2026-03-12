# Phase 3: PII Detection & Content Inspection - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

The kernel detects and redacts PII, financial data, secrets, and custom enterprise patterns in both outbound prompts and inbound streaming responses, replacing detected content with category-tagged placeholders.

This phase implements content inspection and redaction. It builds on the policy engine foundation (Phase 2) to actually scan and transform content flowing through the proxy. New capabilities like dashboards or policy authoring belong in other phases.

</domain>

<decisions>
## Implementation Decisions

### Pattern Matching Aggressiveness
- **Threshold strategy:** Claude's discretion on fail-safe vs permissive (user trusts security best practices)
- **Context-aware detection:** YES — use surrounding words to reduce false positives (accepts performance cost for accuracy)
- **Format strictness:** Hybrid approach — strict patterns first, fuzzy matching for known high-risk categories
- **Overlap resolution:** Tag with all matches — `[PII:PHONE|ACCOUNT]` format shows ambiguity in the redaction

### Redaction Placeholder Format
- **Placeholder style:** Category only — `[PII:EMAIL]` format (clean, minimal, no hints)
- **Per-category formatting:** Claude's discretion based on security best practices
- **SHA-256 hashing:** YES, always log hash — every redaction logs SHA-256 of original for audit/compliance
- **Length preservation:** Fixed length — all placeholders same length (more opaque, may break layouts)

### Streaming Buffer Behavior
- **Buffer size:** Adaptive — start at medium (5-10 tokens), grow if pattern detected mid-match. Must be easily configurable (support small/medium/large presets)
- **Sever vs redact:** Sever on severe violations — redact PII but sever stream if very high-risk content detected
- **Sever injection message:** Custom per policy — each policy defines its own block message
- **Partial pattern handling:** Hold until complete — buffer grows to hold partial match until resolved (accepts latency for accuracy)

### Custom Pattern Configuration
- **Pattern definition:** Both regex and examples supported. Users can provide regex (power users) or examples (inferred patterns). PLUS: Ship with comprehensive default patterns for phone numbers, card numbers, passwords, API keys, etc.
- **Storage/source of truth:** Control plane push — patterns managed centrally, pushed to kernels via gRPC (follows Envoy xDS pattern from research)
- **Update rollout:** Graceful reload + versioned with fallback — finish current requests with old patterns, support rollback if new patterns cause issues
- **Categorization:** Claude's discretion on hybrid approach — needs to be very easy and intuitive to make custom patterns (combine predefined categories, free-form, hierarchical, and tags as appropriate)

### Claude's Discretion
- Threshold for fail-safe vs permissive pattern matching
- Per-category placeholder formatting (severity-based differences if needed)
- Exact custom pattern categorization system (hybrid of predefined/free-form/hierarchical/tags)

</decisions>

<specifics>
## Specific Ideas

- Adaptive buffer starts at 5-10 tokens (roadmap guidance), must be easily configurable
- Default pattern library must be comprehensive — cover common PII, financial, secrets out of box
- Custom patterns follow control plane push model (consistent with policy distribution from research)
- Multi-tag redactions like `[PII:PHONE|ACCOUNT]` preserve detection ambiguity in audit trail

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-pii-detection-content-inspection*
*Context gathered: 2026-02-27*
