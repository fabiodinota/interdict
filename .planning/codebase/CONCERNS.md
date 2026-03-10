# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

**Evidence verification logic split across incompatible implementations:**
- Issue: The control plane verifies signatures against `chain_hash` bytes, while the collector signs protobuf bundle content with chain/signature fields zeroed and the CLI verifier checks a different payload shape.
- Files: `control-plane/src/modules/evidence/service.ts`, `crates/evidence-collector/src/grpc/service.rs`, `crates/interdict-verify/src/signature.rs`, `crates/interdict-verify/src/chain.rs`
- Impact: Dashboard verification can fail or disagree with `interdict-verify`, making operator-facing integrity checks unreliable.
- Fix approach: Standardize one canonical signed payload format in `proto/interdict/evidence/v1/evidence.proto`, reuse the Rust verifier logic from the control plane, and add cross-language fixture tests that verify the same bundle in all three paths.

**Policy distribution still ignores department/team scope:**
- Issue: Snapshot generation fills `scope.org_id`, `scope.dept_id`, and `scope.team_id` with empty strings and ships every compiled policy as org-wide.
- Files: `control-plane/src/modules/distribution/server.ts`, `control-plane/src/modules/compiler/worker.ts`, `control-plane/src/db/schema/policies.ts`
- Impact: Department-specific enforcement is not real yet; multi-team or multi-tenant rollouts risk over-applying or under-scoping controls.
- Fix approach: Add persisted scope assignments, filter snapshots by org/department/team at query time, and add kernel integration tests for mixed-scope policy sets.

**Kernel enforcement context is still anonymous:**
- Issue: Session tracking and emitted evidence use `anonymous` and `unknown` placeholders because end-user identity and department resolution are not wired into the data plane yet.
- Files: `crates/kernel/src/proxy/connect.rs`, `crates/kernel/src/evidence/bundle.rs`, `crates/kernel/src/policy/session.rs`
- Impact: Audit trails cannot attribute actions to real users or departments, weakening incident response and compliance evidence.
- Fix approach: Propagate authenticated actor and department metadata into the kernel session/evidence path and add end-to-end tests that assert real identities survive into evidence storage.

## Known Bugs

**Dashboard evidence verification likely reports false results:**
- Symptoms: The UI promises three cryptographic checks, but the signature step uses a message format that does not match the collector and the Merkle step is always partial.
- Files: `dashboard/src/app/(dashboard)/evidence/page.tsx`, `control-plane/src/modules/evidence/service.ts`, `dashboard/src/components/evidence/VerificationStepper.tsx`
- Trigger: Verify any real bundle through the control plane or dashboard.
- Workaround: Use `crates/interdict-verify` for signature and chain checks until the control-plane verifier is aligned.

**Evidence rows can store a different kernel ID than the chain manager uses:**
- Symptoms: `process_bundle` links by batch-level `kernel_id`, but persisted rows read `bundle.kernel_id` from the payload without normalization.
- Files: `crates/evidence-collector/src/grpc/service.rs`, `proto/interdict/evidence/v1/evidence.proto`
- Trigger: A client submits a batch where `EvidenceBatch.kernel_id` and nested `EvidenceBundle.kernel_id` differ.
- Workaround: Reject mismatched payloads at ingest and overwrite bundle-level kernel IDs from the authenticated transport identity.

**Genesis-chain handling is inconsistent across services:**
- Symptoms: The collector assigns first bundle sequence numbers from the chain manager, while control-plane verification treats sequence `0` as genesis and only compares predecessor hashes for non-zero values.
- Files: `crates/evidence-collector/src/chain/hasher.rs`, `control-plane/src/modules/evidence/service.ts`
- Trigger: Verifying early bundles or backfilled data through the control plane.
- Workaround: Use the Rust verifier for chain checks and align sequence semantics everywhere to start at `1`.

## Security Considerations

**Evidence provenance is only weakly bound to transport identity:**
- Risk: The collector requires mTLS only when configured, but it does not bind client certificates to `kernel_id`, and in insecure mode it accepts any client that can reach the port.
- Files: `crates/evidence-collector/src/main.rs`, `crates/evidence-collector/src/grpc/service.rs`, `docker-compose.yml`
- Current mitigation: Optional mTLS and per-kernel chain state exist.
- Recommendations: Require mTLS outside local dev, map certificate identity to allowed `kernel_id` values, reject mismatched bundle metadata, and add negative tests for spoofed clients.

**Evidence loss is fail-open under backpressure or collector outages:**
- Risk: The kernel drops evidence when the in-memory buffer is full and logs submit failures without local durable retry.
- Files: `crates/kernel/src/evidence/mod.rs`
- Current mitigation: Buffered async flush every 500ms and reconnect-on-submit in `crates/kernel/src/evidence/client.rs`.
- Recommendations: Add disk-backed spooling or WAL, surface dropped-event metrics, and gate high-assurance profiles on durable evidence delivery.

**Dev signing and insecure defaults are still easy to run with:**
- Risk: The collector defaults to `SigningMode::Dev`; local compose also ships default credentials for Postgres, ClickHouse, and MinIO.
- Files: `crates/evidence-collector/src/config.rs`, `crates/evidence-collector/src/main.rs`, `docker-compose.yml`
- Current mitigation: The collector logs `NOT for production`, and the control-plane distribution server blocks insecure gRPC in production.
- Recommendations: Require explicit non-dev signing in production profiles, fail startup on default secrets outside local dev, and provide a hardened sample deployment file separate from local compose.

## Performance Bottlenecks

**Evidence writer commits every row immediately:**
- Problem: The ClickHouse inserter writes a row and then calls `commit()` for every incoming row, reducing batching efficiency.
- Files: `crates/evidence-collector/src/storage/clickhouse.rs`
- Cause: `run_inserter_worker` commits on each `WriteCommand::Row` instead of relying on inserter thresholds.
- Improvement path: Commit on size/time thresholds only, expose queue depth and flush latency metrics, and load-test hourly Merkle windows at expected peak throughput.

**Review sync is timer-driven polling over ClickHouse:**
- Problem: Human review ingestion polls every 60s and scans recent escalations from ClickHouse rather than consuming a durable queue.
- Files: `control-plane/src/modules/reviews/service.ts`, `control-plane/src/modules/reviews/index.ts`
- Cause: The review queue is backfilled from analytics storage instead of being written transactionally at enforcement time.
- Improvement path: Emit review items directly from the evidence ingest path or via a dedicated queue/topic, then reserve ClickHouse for read models.

## Fragile Areas

**Evidence path has three divergent sources of truth:**
- Files: `crates/kernel/src/evidence/mod.rs`, `crates/evidence-collector/src/grpc/service.rs`, `control-plane/src/modules/evidence/service.ts`, `crates/interdict-verify/src/*`
- Why fragile: Bundle encoding, hash semantics, signature semantics, and verification logic are duplicated across Rust and TypeScript.
- Safe modification: Change the proto contract first, update collector + CLI verifier + control-plane verifier together, and validate with golden fixtures.
- Test coverage: Rust unit coverage exists; no CI path exercises the TypeScript verifier against real collector-generated bundles.

**Kernel proxy enforcement is concentrated in very large files:**
- Files: `crates/kernel/src/proxy/connect.rs`, `crates/kernel/src/policy/mod.rs`, `crates/kernel/src/main.rs`
- Why fragile: Connection handling, policy evaluation, evidence emission, session tracking, and startup wiring are tightly coupled.
- Safe modification: Isolate evidence emission, actor resolution, and live-policy selection into smaller modules before changing enforcement semantics.
- Test coverage: Kernel integration tests exist in `crates/kernel/tests`, but cross-cutting behavior still depends on broad end-to-end flows.

## Scaling Limits

**Human review queue throughput is capped by SQLite and polling sync:**
- Current capacity: In-process queueing and SQLite storage in `KERNEL_REVIEW_DB_PATH` suit single-node or low-volume workflows.
- Limit: Multi-kernel or high-escalation deployments will contend on sync lag, duplicate polling windows, and non-distributed review state.
- Scaling path: Move review creation and state management to a shared service/database with explicit leasing and metrics.

**Hourly Merkle anchoring assumes bounded bundle volume per hour:**
- Current capacity: `COLLECTOR_MERKLE_MAX_LEAVES` defaults to 1,000,000 with overflow-triggered sub-hourly rotation.
- Limit: High-throughput deployments can hit the cap and depend on a best-effort overflow signal.
- Scaling path: Pre-split anchor windows by kernel or shard, persist overflow state durably, and test sustained high-ingest scenarios.

## Dependencies at Risk

**Bun/TypeScript services are outside the enforced CI path:**
- Risk: `control-plane` and `dashboard` can drift because the only repository workflow runs Rust quality/security checks.
- Impact: Auth, policy management, dashboard UX, and verification APIs can break without merge-time detection.
- Migration plan: Add Bun install/build/test/lint jobs for `control-plane/package.json` and `dashboard/package.json`, then require them in branch protection.

## Missing Critical Features

**Independent evidence verification is incomplete in the product surface:**
- Problem: The dashboard advertises Merkle proof inclusion, but the control plane explicitly returns partial verification because it has no anchor access.
- Blocks: A self-service compliance workflow where operators can fully verify bundles without dropping to CLI tooling.

**Per-tenant policy scope and actor attribution are not complete:**
- Problem: Department/team scope is deferred and kernel evidence still records anonymous actors.
- Blocks: Credible enterprise rollout for departmental governance, insider investigations, and tenant-isolated policy enforcement.

**Kubernetes/air-gapped deployment assets are not present in-repo:**
- Problem: The repository has Docker assets in `docker/` and `docker-compose.yml`, but no checked-in `k8s/`, Helm, or air-gap packaging manifests were detected.
- Blocks: The operating contract's VPC-native, sidecar, and air-gapped deployment claims are not demonstrably reproducible from source.

## Test Coverage Gaps

**No CI coverage for control-plane or dashboard behavior:**
- What's not tested: Bun API routes, SAML flow, signing-key registry behavior, dashboard proxying, and UI verification screens.
- Files: `.github/workflows/ci-quality-security.yml`, `control-plane/package.json`, `dashboard/package.json`
- Risk: Regressions in auth, evidence verification, or reporting can ship while Rust checks stay green.
- Priority: High

**No end-to-end test proving real bundle verification through the control plane:**
- What's not tested: Collector-generated bundles verified via `control-plane/src/modules/evidence/service.ts` and rendered by the dashboard.
- Files: `control-plane/src/modules/evidence/service.ts`, `dashboard/src/components/evidence/VerificationStepper.tsx`, `crates/evidence-collector/tests/integration_test.rs`
- Risk: The product can claim successful verification while using incompatible cryptographic assumptions.
- Priority: High

**No test coverage for kernel evidence durability under failure:**
- What's not tested: Buffer overflow, collector downtime, repeated reconnect failure, and graceful recovery without evidence loss.
- Files: `crates/kernel/src/evidence/mod.rs`, `crates/kernel/src/evidence/client.rs`
- Risk: Evidence gaps can go unnoticed until an audit or incident response event.
- Priority: High

---

*Concerns audit: 2026-03-10*
