# 🔍 Interdict — Comprehensive Project Assessment

**Date:** 2026-03-12
**Scope:** Full codebase audit — architecture, security, error handling, tests, code quality, CI/CD, deployment, documentation

---

## Executive Summary

Interdict is an **AI governance proxy** with a 3-crate Rust data plane, a TypeScript control plane, and a Next.js dashboard. The project is architecturally ambitious and well-documented. You have **~24,500 lines of Rust**, **~427 tests**, a formal security review, and a substantial deployment story (Docker Compose + Helm). Here is the honest, line-by-line assessment.

---

## 1. ARCHITECTURE — ✅ Strong

| Aspect | Grade | Notes |
|---|---|---|
| Separation of concerns | **A** | Data plane (Rust) / control plane (TS) / dashboard (Next.js) — clean boundaries |
| Policy pipeline design | **A** | 3-layer pipeline (L1 Rego → L2 NLP → L3 human review) is well-reasoned and auditable |
| Evidence chain | **A** | SHA-256 chaining, Ed25519 signing, Merkle trees, independent verifier binary |
| Streaming-first hot path | **A-** | Uses `tokio::io::copy_bidirectional`, sliding window buffer for streaming PII detection |
| No LLM inline decisions | **A** | Correctly uses deterministic Rego + Wasm, NLP is analytics/fallback only |
| All channels bounded | **A** | `KERN-13` invariant consistently enforced, comments reference it throughout |
| Deployment flexibility | **A** | VPC-native, sidecar, air-gapped modes with Helm templates for each |

**One concern:** `main.rs` at 533 lines is doing too much startup orchestration. Consider extracting a `bootstrap.rs` module.

---

## 2. ERROR HANDLING — ⚠️ Mixed (Good core, some gaps)

### What's done well

- **`ProxyError` enum** with `thiserror` — structured, typed error variants for the hot path
- **Fail-closed default** — policy eval errors → Block (not crash)
- **`anyhow`** used correctly for application-level errors in `main.rs`, config, and startup
- **Evidence delivery** — graceful degradation with retry queue, health tracking, bounded drops
- **gRPC service** — proper `Status` returns, validates `kernel_id` input, handles stream errors

### Critical issues

#### 🔴 14 `Regex::new(...).unwrap()` calls in production code (`patterns/default.rs`)

These are in `default_patterns()` — called at startup. If **any** regex is malformed, the entire kernel panics on boot with no meaningful error message.

**Fix:** Compile patterns once using `std::sync::LazyLock<Regex>` or validate them in a `fn default_patterns() -> Result<Vec<PatternRule>>` and propagate the error.

#### 🔴 `InjectionDetector::default()` uses `.expect()` in production

```rust
Self::new().expect("static injection regexes should compile")
```

This is the `Default` trait impl — called from anywhere. Should be fallible or use `LazyLock`.

#### 🟡 `RegorusPool::evaluate` uses `.expect("semaphore guarantees engine availability")`

This is line 83 in `regorus.rs`. While the semaphore *should* guarantee availability, if the `crossbeam_queue::SegQueue` is somehow empty (bug, data race), this panics in the hot path. Should log and return `fail_mode.default_action()` instead.

#### 🟡 `request_id.rs` line 102: `v.to_str().unwrap()` in production middleware

The `HeaderValue::to_str()` can fail on non-ASCII values. Currently inside a test echo service, but the pattern is fragile.

#### ✅ No `unwrap()`/`expect()` in `main.rs` production path — uses `?` and `anyhow::Context` throughout. Good.

#### ✅ No `unwrap()`/`expect()` in `connect.rs` production path (all are inside `#[cfg(test)]`). Good.

#### ✅ Evidence flusher — all error paths are handled with retry/drop/logging. Excellent.

---

## 3. SECURITY — ✅ Thorough (with tracked open items)

### What's exceptional

- **Formal security review** exists: `ATTACK_SURFACE.md`, `FIX_PLAN.md`, `PASS2_FINAL_MATRIX.json`, `RUNTIME_VALIDATION.md`
- **31 findings tracked**, 22+ already FIXED including both Criticals (CRIT-001, CRIT-002)
- **mTLS enforced** between kernel ↔ control-plane ↔ evidence-collector in release builds
- **Release-mode guards:**
  ```rust
  #[cfg(not(debug_assertions))]
  if !evidence_collector_addr.starts_with("https://") { ... }
  if mtls_certs.is_none() { ... }
  ```
- **No plaintext secret logging** — grep confirms zero matches for logging tokens/passwords
- **Evidence integrity** — hashes before mutation, Ed25519 signatures, Merkle anchors
- **gRPC TLS enforcement** validated at runtime (certificate_required alerts captured)

### Open security items

| ID | Severity | Issue |
|---|---|---|
| MED-007 | Medium | Default credentials in `docker-compose.yml` / `env.example` (interdict/interdict) |
| MED-008 | Medium | Unresolved JS dependency vulnerabilities |
| MED-012 | Medium | Containers run as root with writable rootfs |
| MED-S7 | Medium | Pervasive `async (ctx: any)` in control-plane route handlers (~40 occurrences) |
| MED-S8 | Medium | DB access bypasses `.derive()` in regulatory module |
| NEW-RAW-TOKEN | Medium | Raw session token stored in `saml_handoff_codes` for 60s window |
| LOW-013 | Low | CI lacks artifact signing and provenance checks |

### `unsafe` code

- **3 `unsafe` blocks** in build scripts (all `std::env::set_var` for protobuf config — unavoidable in Rust 2024 edition)
- **1 `unsafe fn deserialize_module`** in `wasm_engine.rs` — has `// SAFETY:` comment. This is a Wasmtime requirement for pre-compiled module loading. Acceptable.

---

## 4. TESTS — ✅ Solid coverage, some gaps

### Counts

| Metric | Value |
|---|---|
| Total `#[test]` / `#[tokio::test]` | **427** |
| Test functions | **373** |
| Integration test files | **14** |
| Benchmark files | **2** |
| Dashboard test files | **8** (~1,033 lines) |
| Largest test file | `adversarial.rs` (1,688 lines!) |

### What's well tested

- **Policy pipeline** — L1 block, L1 allow with background L2, L2 escalation, L3 timeout, fail-closed, fail-open, no-short-circuit guarantee
- **Content inspection** — PII patterns, adversarial inputs (1,688 lines of adversarial tests!)
- **Evidence chain** — signing, Merkle building, chain verification, key rotation
- **Connection pool** — exhaustion, per-vendor limits, FIFO fairness
- **Streaming relay** — redaction in chunked streams, cross-chunk detection
- **Distribution snapshots** — full/delta apply, version monotonicity
- **Dashboard** — auth routes, proxy, middleware, VerificationStepper component

### Gaps

| Gap | Impact |
|---|---|
| **No `deny.toml` (cargo-deny)** | License compliance and duplicate crate detection not automated |
| **No workspace-level `[lints]`** | Clippy lint policy not declared in `Cargo.toml` — relies purely on CI flag |
| **No property-based testing** | `criterion` benchmarks exist but no `proptest` or `quickcheck` for fuzzing PII patterns |
| **No end-to-end integration test** | Kernel → evidence-collector pipeline not tested as a connected system |
| **Evidence collector tests run `--test-threads=1`** | Indicates shared mutable state (env vars in config tests) — fragile |
| **No load/stress tests** | Benchmarks exist for latency but no sustained throughput testing |
| **Dashboard coverage config** only covers `api/`, `middleware.ts`, `lib/api.ts`, `evidence/` — no UI component coverage |

---

## 5. CODE QUALITY — ✅ Good (minor debt)

### Formatting & Linting

- ✅ `cargo fmt --check` passes clean
- ⚠️ `cargo clippy` **cannot build locally** due to `ring` crate C compiler issue (`vcruntime.h` missing). This is a **local Windows dev environment issue**, not a code issue — CI runs on Ubuntu and passes.
- ✅ `rustfmt.toml` configured (edition 2024, 100 char width)
- ✅ Dashboard has Prettier + ESLint configured
- ✅ Control-plane uses Biome for lint+format

### Dependencies

- **Kernel** has 40+ direct dependencies — heavy but justified for the scope (Hyper, Tokio, Rustls, Regorus, Wasmtime, Tract-ONNX, SQLite, gRPC)
- ⚠️ **`rand` version mismatch**: kernel uses `rand = "0.9"`, evidence-collector uses `rand = "0.8"` — will cause duplicate `rand` in the dependency tree
- ⚠️ **No `deny.toml`** — no automated license/duplicate/advisory checking beyond `cargo audit`
- ✅ `renovate.json` exists for dependency automation
- ✅ CI runs `cargo audit` and Trivy filesystem scan

### Code organization

- ✅ Clean module hierarchy: `proxy/`, `policy/`, `evidence/`, `middleware/`
- ✅ Policy pipeline uses layered architecture matching docs
- ⚠️ `main.rs` at 533 lines — too much bootstrapping logic inline
- ⚠️ `policy/mod.rs` at 901 lines — tests are ~500 lines, but the module could benefit from splitting
- ✅ All public items have doc comments

---

## 6. CI/CD — ✅ Comprehensive

### Pipeline

```
ci-quality-security.yml
├── infra-quality (shellcheck, yamllint, hadolint, buf, helm lint)
├── quality × 3 modes (vpc-native, sidecar, air-gapped)
│   ├── cargo fmt --check
│   ├── cargo clippy -D warnings
│   ├── cargo test (evidence-collector serialized, rest parallel)
│   └── content_inspection_test gate
├── security
│   ├── cargo audit
│   ├── cargo deny (if deny.toml exists — currently SKIPPED)
│   └── Trivy filesystem scan
├── control-plane (bun install, biome check, tsc, bun test)
└── dashboard (npm ci, prettier, eslint, vitest, next build)
```

### What's good

- ✅ Multi-deployment-mode matrix testing
- ✅ Dedicated security job
- ✅ Infrastructure linting (Dockerfiles, YAML, shell, protobuf, Helm)
- ✅ Both Rust and TypeScript fully gated

### Gaps

- ❌ **No `deny.toml`** — `cargo deny` step skips silently
- ❌ **No artifact signing** (LOW-013)
- ❌ **No coverage reporting** — no codecov/lcov integration
- ⚠️ **No MSRV enforcement** — no `rust-version` in Cargo.toml

---

## 7. DEPLOYMENT — ✅ Production-ready structure

- ✅ Docker Compose with cert-init, Postgres, ClickHouse, MinIO, all 4 services
- ✅ Helm chart with NetworkPolicies, PDBs, HPAs, configmaps, sidecar templates
- ✅ `values.yaml`, `values-enterprise.yaml`, `values-pilot.yaml`
- ✅ mTLS certificate bootstrap via init container
- ⚠️ **Containers run as root** (MED-012 — open)
- ⚠️ **Default credentials** in templates (MED-007 — open)

---

## 8. DOCUMENTATION — ✅ Exceptional

- ✅ `CLAUDE.md` / `AGENTS.md` with non-negotiable invariants
- ✅ `.claude/rules/` with architecture, workflow, security rules
- ✅ `.claude/agents/` with 8 specialized subagent profiles
- ✅ `.claude/skills/` with 5 project-specific skills
- ✅ `security-review/` with formal 4-document review
- ✅ `.planning/milestones/` with phased delivery (4 phases, 16+ sub-plans)
- ✅ `education.md` for mistake tracking
- ⚠️ No `CONTRIBUTING.md` or `CHANGELOG.md`

---

## 🎯 Priority Fix List

### P0 — Must fix (production safety)

1. **Replace all `Regex::new(...).unwrap()` in `patterns/default.rs`** with `LazyLock` or fallible construction — 14 panic points on startup
2. **Replace `InjectionDetector::default()` `.expect()`** — use `LazyLock` or `OnceCell`
3. **Replace `RegorusPool .expect("semaphore guarantees")`** — return fail-mode verdict instead of panicking

### P1 — Should fix (security / correctness)

4. **Add `deny.toml`** for license compliance + duplicate crate detection
5. **Align `rand` version** — evidence-collector `0.8` → `0.9` to match kernel
6. **Add workspace `[lints]`** to `Cargo.toml` for consistent clippy policy
7. **Fix container images** — run as non-root, read-only rootfs (MED-012)
8. **Fix default credentials** in docker-compose/env templates (MED-007)

### P2 — Should improve (quality / robustness)

9. **Extract `main.rs` bootstrapping** into a `bootstrap.rs` module
10. **Add property-based testing** for PII pattern matching (proptest)
11. **Add coverage reporting** to CI
12. **Fix local Windows build** — `ring` crate `vcruntime.h` missing (dev environment issue)
13. **Add `CONTRIBUTING.md`** and `CHANGELOG.md`

---

**Bottom line:** This is a well-architected, well-documented, seriously-built project. The security review alone is more thorough than most production codebases. The main debt is **14 `unwrap()` calls on regex compilation in the hot-path initialization** and **missing `deny.toml`**. Everything else is tracked, tested, or gated by CI.
