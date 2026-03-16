# S06: Proto Safety, Observability & Testing — Research

**Date:** 2026-03-16

## Summary

S06 has 8 distinct work items spanning Rust (proto validation, flaky test, timestamp safety, PEM validation, Merkle proofs, roundtrip test, Prometheus metrics) and TypeScript (control-plane Prometheus metrics, vitest mock hoisting fix). Each item is well-scoped and follows established patterns. The primary technical risks — `buf.validate max_len = 0` support and `prom-client` Bun compatibility — are both tractable (confirmed by code inspection and known workarounds).

The collector Prometheus endpoint is the most complex addition (new HTTP server alongside existing gRPC, new crate dependency). The flaky test fix is the most architecturally interesting (replacing sleep-based synchronization with channel notifications). Everything else is surgical: a proto field annotation change, two `as` casts replaced with `try_from`, ASN.1 envelope validation in PEM parsing, and a `vi.mock` relocation.

## Recommendation

**Build in this order:**

1. **Proto `max_len = 0` + timestamp safety** (quick, independent, unblocks `buf lint` and `cargo clippy` checks early)
2. **Flaky test fix** (independent Rust work, proves FH-QUALITY-01)
3. **PEM ASN.1 validation** (independent, surgical)
4. **Merkle proof generation + verification** (depends on S01's `chain_hashes`, core FH-TESTING-01)
5. **Collector→verifier roundtrip integration test** (depends on Merkle proofs)
6. **Prometheus endpoints** (both Rust and TS, largest body of work, proves FH-OBSERVABILITY-01)
7. **Vitest mock hoisting fix** (quick TS fix, last because it's trivial)

For Rust Prometheus: use the `prometheus` crate (most mature, text exposition format built in) with a minimal hyper HTTP server on port 9090 — hyper is already in the dep tree via tonic. Expose `WriterHealth` atomic counters as Prometheus counters, plus signing and Merkle metrics.

For control-plane Prometheus: use `prom-client` but **skip `collectDefaultMetrics()`** (which calls `monitorEventLoopDelay`, undefined in Bun). Register only custom metrics (Counter, Histogram). Expose via a new `/metrics` GET route on the existing Elysia app.

## Implementation Landscape

### Key Files

#### Proto Safety
- `proto/interdict/evidence/v1/evidence.proto` — Change `max_len = 1048576` to `max_len = 0` on `prompt_text` (field 10) and `response_text` (field 11). The CEL expression `uint(this.size()) > rules.max_len` rejects any non-empty string when max_len=0. `buf lint` currently passes clean.

#### Timestamp Safety
- `crates/evidence-collector/src/grpc/service.rs:302` — `timestamp.nanos as u32` is unsafe: proto nanos is `i32` and could be negative. Replace with `u32::try_from(timestamp.nanos).unwrap_or(0)` or clamp to 0.
- `crates/kernel/src/evidence/bundle.rs:57` — `ts.timestamp_subsec_nanos() as i32` is technically safe (chrono returns 0..999_999_999 which fits i32) but should use explicit `i32::try_from().expect()` for clarity and clippy compliance.

#### Flaky Test
- `crates/kernel/src/policy/layer3/queue.rs` — 4 tests use `tokio::time::sleep(Duration::from_millis(50))` for synchronization. Replace with a notification channel: have `escalate()` signal when the pending map insertion completes, so tests wait on that signal instead of racing against wall time.
  - Pattern: Add `#[cfg(test)] pub escalation_ready: Option<tokio::sync::watch::Sender<()>>` to `ReviewQueue`, signal after `self.pending.insert()`. Tests create the watch channel, await it, then proceed.
  - Alternative: Use `tokio::time::pause()` + `advance()` for time-controlled tests. But the issue is task scheduling, not timing — a notification channel is more correct.

#### PEM ASN.1 Validation
- `crates/evidence-collector/src/signing/local.rs` — `decode_pem()` strips headers and base64-decodes but doesn't validate the payload structure. For Ed25519 PKCS8 DER, the ASN.1 structure is: `SEQUENCE { SEQUENCE { OID 1.3.101.112 }, OCTET STRING { OCTET STRING { 32-byte-key } } }`. The key payload starts at a known offset (16 bytes of ASN.1 overhead for Ed25519 PKCS8).
  - Approach: After base64 decode, check if the result is 48 bytes (PKCS8 Ed25519 envelope). If so, validate the OID bytes at positions 7-11 match `[0x06, 0x03, 0x2b, 0x65, 0x70]` (OID 1.3.101.112) and extract the 32-byte key from offset 16. Reject if OID doesn't match. Fall through to existing raw-key handling for 32-byte and 64-byte payloads.
  - No new dependencies needed — this is a fixed-format byte check, not general ASN.1 parsing.

#### Merkle Proof Generation
- `crates/evidence-collector/src/merkle/builder.rs` — Add `proof_for_bundle(&self, bundle_hash: &[u8; 32]) -> Option<MerkleProofData>` method on `HourlyMerkleBuilder`. Uses `rs_merkle`'s `MerkleTree::proof(&[leaf_index])` which returns `MerkleProof<Sha256>`. The proof bytes + leaf index + total_leaves form the inclusion proof.
  - `MerkleProofData` struct: `{ proof_bytes: Vec<u8>, leaf_index: usize, total_leaves: usize, root: [u8; 32] }`.
  - Need to find the leaf index by scanning `self.leaf_hashes` for the matching hash.
  - `rs_merkle` API: `tree.proof(&[index])` returns `MerkleProof<T>`, `proof.to_bytes()` serializes, `proof.verify(root, &[index], &[hash], total)` validates.

#### Merkle Proof Verification
- `crates/interdict-verify/src/merkle.rs` — Add `verify_bundle_proof(proof_bytes: &[u8], leaf_hash: &[u8; 32], leaf_index: usize, total_leaves: usize, expected_root: &[u8; 32]) -> bool`. Uses `MerkleProof::<Sha256>::from_bytes()` to deserialize and `.verify()` to check.

#### Roundtrip Integration Test
- `crates/evidence-collector/tests/roundtrip_test.rs` — New file. Creates bundles via collector pipeline (chain → sign → Merkle), then verifies with interdict-verify (chain verification, signature verification, Merkle root verification, individual bundle Merkle proof verification). This extends the existing `integration_test.rs` pattern but adds Merkle proof coverage.
  - Pattern: create N bundles → add chain hashes to MerkleBuilder → finalize → for each bundle, generate proof → verify proof against root. Then use interdict-verify to verify chain + signatures + Merkle root.

#### Evidence Collector Prometheus (`/metrics` on port 9090)
- `crates/evidence-collector/src/main.rs` — Spawn a minimal hyper HTTP server on port 9090 alongside the gRPC server. The `/metrics` endpoint returns Prometheus text format.
- `crates/evidence-collector/src/metrics.rs` — New module. Defines Prometheus counters/histograms using the `prometheus` crate:
  - `evidence_bundles_received_total` (Counter)
  - `evidence_bundles_written_total` (Counter, from `WriterHealth::rows_written`)
  - `evidence_bundles_retried_total` (Counter, from `WriterHealth::rows_retried`)
  - `evidence_bundles_dead_lettered_total` (Counter, from `WriterHealth::rows_dead_lettered`)
  - `merkle_anchors_written_total` (Counter)
  - `signing_operations_total` (Counter)
  - `evidence_write_latency_seconds` (Histogram)
- `crates/evidence-collector/Cargo.toml` — Add `prometheus = "0.14"` (text format encoding built in).
- Approach: Either (a) periodically sync `WriterHealth` atomics into Prometheus counters via a background task, or (b) use a custom collector that reads atomics on scrape. Option (b) is cleaner — implements `prometheus::core::Collector` trait to read `WriterHealth` on each `/metrics` request.
- Alternative: Hand-roll Prometheus text format (counter lines only) without adding the `prometheus` crate. Since all metrics are simple counters/gauges from existing atomics, this avoids a new dependency. The text format is trivial: `# TYPE metric_name counter\nmetric_name value\n`.

#### Control Plane Prometheus
- `control-plane/src/metrics.ts` — New module. Uses `prom-client` (needs to be added to package.json). Registers custom metrics only — **no `collectDefaultMetrics()`** (Bun lacks `monitorEventLoopDelay`).
  - `http_requests_total` (Counter, labels: method, path, status)
  - `http_request_duration_seconds` (Histogram, labels: method, path)
  - `rate_limit_rejections_total` (Counter)
  - `session_cleanup_rows_total` (Counter)
  - `policy_compilations_total` (Counter, labels: status)
- `control-plane/src/index.ts` — Add `.get("/metrics", ...)` route that calls `register.metrics()`. Add onAfterHandle/onBeforeHandle hooks for request counting/timing.
- `control-plane/src/modules/auth/cleanup.ts` — Increment `session_cleanup_rows_total` on cleanup runs.
- `control-plane/src/modules/compiler/worker.ts` — Increment `policy_compilations_total` on compilation.

#### Prometheus Scrape Config
- `monitoring/prometheus/prometheus.yml` — Update evidence-collector job from `/probe` on port 50051 to `/metrics` on port 9090. Update control-plane job from `/health` on port 3000 to `/metrics` on port 3000.

#### Vitest Mock Hoisting
- `dashboard/src/__tests__/helpers/next-mocks.ts:80` — `vi.mock("next/headers", ...)` inside `mockNextHeadersCookies()` function triggers vitest hoisting warning. Move the `vi.mock` call to module-level scope. The mock factory can reference a module-level mutable store that `mockNextHeadersCookies()` configures before each test.

### Build Order

1. **Proto + timestamp** (5 min each, unblocks `buf lint` and `cargo build` gates)
2. **Flaky test** (independent Rust, eliminates CI nondeterminism)
3. **PEM validation** (independent, small scope)
4. **Merkle proofs** (needs S01's `chain_hashes` — already done, needs `rs_merkle` proof API)
5. **Roundtrip test** (depends on Merkle proofs being available)
6. **Prometheus endpoints** (largest task, both Rust + TS, update scrape config)
7. **Vitest fix** (trivial, close out last)

Tasks 1-3 are fully independent and could be parallelized. Task 4-5 are sequential. Task 6 is independent of 4-5 but is the largest body of work. Task 7 is trivial and independent.

### Verification Approach

- `buf lint` — must pass clean after `max_len = 0` change
- `cargo build --workspace` — must pass (proto change propagates through codegen)
- `cargo test -p kernel` — flaky test must pass deterministically (run 10x with `--test-threads=1`)
- `cargo test -p evidence-collector` — all existing + new tests pass
- `cargo test -p interdict-verify` — Merkle proof verification tests pass
- `cargo test --workspace --all-targets` — zero failures
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean
- `bun test` (in control-plane/) — passes with metrics module tests
- `npx vitest run` (in dashboard/) — passes with zero warnings (mock hoisting warning gone)
- `buf lint` — clean
- Prometheus endpoint smoke: manual `curl localhost:9090/metrics` produces valid exposition format (structural test in Rust unit tests)

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Merkle proof generation/verification | `rs_merkle` 1.5 `MerkleTree::proof()` + `MerkleProof::verify()` | Already in dep tree, battle-tested API |
| Prometheus text format (Rust) | `prometheus` crate 0.14 OR hand-rolled text format | Counter-only metrics are trivial to format as text — hand-rolling avoids a new dep. Decision for planner. |
| Prometheus metrics (TypeScript) | `prom-client` npm package | De facto standard for Node.js/Bun Prometheus integration |
| Ed25519 PKCS8 ASN.1 parsing | Fixed-format byte check (48-byte PKCS8 envelope with known OID offset) | General ASN.1 parsers like `der-parser` are overkill for a single known format |

## Constraints

- `rs_merkle` 1.5's `MerkleTree::proof()` requires leaf indices as `&[usize]` — must find the index by scanning `leaf_hashes` Vec for the target hash.
- `prom-client` `collectDefaultMetrics()` crashes on Bun due to missing `monitorEventLoopDelay`. Must use custom metrics only.
- Evidence-collector is a gRPC server (tonic/hyper) with no existing HTTP endpoint. The `/metrics` HTTP endpoint needs a separate listener on port 9090.
- Proto `max_len = 0` works because the buf.validate CEL expression is `uint(this.size()) > 0` which rejects any non-empty string. Empty strings (default value for proto3 string fields) pass through — this is correct behavior since proto3 doesn't distinguish between "not set" and "empty".
- The vitest mock hoisting fix must ensure `vi.mock("next/headers")` is at the module top level. The function `mockNextHeadersCookies()` cannot call `vi.mock` — it can only configure the mock's return value.

## Common Pitfalls

- **`MerkleTree::proof()` on a tree with uncommitted changes** — Must call `from_leaves()` to build the full tree before calling `proof()`. The builder's `finalize()` already does this, so proof generation should happen before `reset()`.
- **Prometheus metrics double-registration** — The `prometheus` crate's global registry rejects duplicate metric names. If using the global registry, guard registration with `register!()` macro. If using a custom registry, pass it explicitly.
- **prom-client default metrics on Bun** — `collectDefaultMetrics()` throws `TypeError: monitorEventLoopDelay is not a function`. Skip it entirely; register only custom metrics.
- **vi.mock hoisting changes test behavior** — Moving `vi.mock("next/headers")` to module level means ALL tests in files that import `next-mocks.ts` will have `next/headers` mocked. Check that no test expects the real `next/headers` module (none do — all API route tests already mock it).

## Open Risks

- **Hand-rolled Prometheus text format vs `prometheus` crate**: Hand-rolling is simpler for counters/gauges but means no histogram support if future slices need write latency histograms. Adding the `prometheus` crate now is forward-compatible but adds ~200KB to the dep tree. Planner should decide.
- **Proof generation timing**: `proof_for_bundle()` requires the tree to still be in memory (not yet reset). If called after `do_rotate` resets the builder, the proof is lost. The proof method should be on the finalized `MerkleAnchor` + `chain_hashes` data, not on the mutable builder — this way proofs can be generated from persisted anchor files.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Protobuf / buf | `bufbuild/claude-plugins@protobuf` | available (48 installs) — not needed, work is straightforward |
| Rust | `rust-skills` | installed |
| Prometheus (Go focus) | `existential-birds/beagle@prometheus-go-code-review` | available — not relevant (Go, not Rust/TS) |
