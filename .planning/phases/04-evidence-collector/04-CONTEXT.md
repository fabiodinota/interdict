# Phase 4: Evidence Collector - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

A separate Rust binary service that receives evidence events from the kernel via gRPC, builds cryptographically linked SHA-256 hash chains with Ed25519 signatures, constructs hourly Merkle trees, anchors root hashes to S3 Object Lock (WORM), and batch-inserts to ClickHouse. Includes a standalone regulator verification CLI for independent chain integrity auditing.

</domain>

<decisions>
## Implementation Decisions

### Evidence Bundle Schema
- Store SHA-256 hashes of prompt/response by default, not plaintext. Enterprise-configurable toggle to enable full text storage for regulations that require it.
- Include department/team attribution from SSO claims in every bundle, enabling per-department compliance reporting in Phase 9.
- Use zstd compression for evidence bundles sent from kernel to collector (fast, good ratio, mature Rust crate).
- Use protobuf as the wire and storage format. Self-describing, versioned, backward-compatible. Already needed for gRPC transport — one schema for wire + storage.

### Key Management
- KMS-backed signing keys (AWS KMS / Azure Key Vault) with local in-memory cache. Kernel fetches signing key at startup, caches locally. Air-gapped mode falls back to file-based keys.
- Static key provisioning in Phase 4. Key rotation, revocation, and lifecycle management deferred to Phase 7 (Identity, Access & Security).
- In dev/test mode, auto-generate ephemeral Ed25519 keypairs at startup. No KMS dependency for local development. Clear marker in evidence bundles that they are dev-signed.
- One unique Ed25519 keypair per kernel instance. Enables attribution of which kernel signed which evidence. Limits blast radius if one key is compromised.

### ClickHouse Data Model
- Daily partitions (toYYYYMMDD). Balances query performance with part count management under the 150-parts-per-partition constraint.
- Configurable TTL with 7-year default retention. Aligns with financial services compliance (SOX, MiFID II). Enterprise can override per deployment.
- Create 2-3 basic materialized views in Phase 4: hourly violation counts, per-vendor usage stats, per-department summary. Phase 5 API queries these directly.
- Support optional embedded ClickHouse mode for single-node air-gapped deployments. External ClickHouse instance is the primary path.

### Verification Tooling
- Three verification modes: single bundle, time-range chain, and full chain integrity check. Auditors pick scope based on investigation needs.
- Default output is human-readable summary with pass/fail per check. --json flag for machine-parseable output (CI pipelines, automated compliance checks).
- Export-based offline verification. Enterprise exports evidence bundles to a file or S3 bucket. Auditor runs CLI against the export with no network access to production.
- Standalone `interdict-verify` binary, separate from evidence-collector. Clean trust boundary — verification code isolated from collection code. Auditors download one tool with zero runtime dependencies.

### Claude's Discretion
- gRPC service definition structure and streaming patterns
- Merkle tree implementation details (batch size, tree depth)
- ClickHouse materialized view definitions
- Internal buffer management and backpressure strategy
- Embedded ClickHouse integration approach

</decisions>

<specifics>
## Specific Ideas

- Evidence collector is a separate Rust binary (EVID-08), not part of the kernel — CPU-intensive crypto operations must not affect proxy latency
- The 500ms background flush from kernel to collector is async and must not add latency to proxied AI responses (SC1)
- Batch inserts: minimum 1000 rows, maximum 1 INSERT/second to prevent ClickHouse "too many parts" failures (EVID-07)
- S3 Object Lock (WORM) anchoring for hourly Merkle roots provides external immutability verification independent of the database

</specifics>

<deferred>
## Deferred Ideas

- Key rotation and revocation lifecycle — Phase 7 (Identity, Access & Security)
- TEE integration for evidence signing (AWS Nitro Enclaves) — ADV-06 backlog
- Compliance report generation from evidence data — Phase 9
- Evidence verification UI — Phase 9

</deferred>

---

*Phase: 04-evidence-collector*
*Context gathered: 2026-02-27*
