# M006: Production Safety & Quality — Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

## Project Description

Interdict.io is a kernel-level AI governance and compliance platform. v1.2 shipped all functional requirements. This milestone addresses production safety, security hygiene, and developer experience debt identified during scan remediation and hardening reviews.

## Why This Milestone

Post-v1.2 scans surfaced 13 concrete issues across three severity bands: panic paths in the hot path (P0), security/dependency hygiene gaps (P1), and quality/DX improvements (P2). These need to be resolved before pilot deployments to avoid runtime panics, supply-chain risk, and contributor friction.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Deploy the kernel without risk of panic from regex compilation or semaphore invariant violations
- Run `cargo deny check` in CI with license compliance and duplicate crate detection
- Build container images that run as non-root with read-only rootfs
- Start docker-compose without any default/hardcoded credentials
- Run property-based fuzz tests against the PII pattern library
- See code coverage reports in CI

### Entry point / environment

- Entry point: `cargo test --workspace`, `docker compose up`, CI pipeline
- Environment: local dev (Windows + WSL), CI (GitHub Actions), Docker
- Live dependencies involved: none (all changes are internal)

## Completion Class

- Contract complete means: all Rust panic paths replaced with Result propagation; `cargo deny check` passes; proptest suite runs
- Integration complete means: Docker images build and run as non-root; docker-compose starts with parameterized credentials
- Operational complete means: CI pipeline includes deny, coverage, and all new quality gates

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `cargo test --workspace` passes with zero panics from pattern/injection/regorus initialization
- `cargo deny check` passes in CI
- All 4 Dockerfiles produce non-root containers with read-only rootfs
- docker-compose.yml has no hardcoded credentials
- `cargo test -p kernel --test proptest_patterns` runs property-based PII pattern tests
- CI produces coverage reports

## Risks and Unknowns

- LazyLock availability — requires Rust 1.80+, should be fine on current MSRV
- proptest interaction with regex patterns — may surface real bugs in pattern library
- Windows ring build — known dev environment issue, may not be fully resolvable

## Existing Codebase / Prior Art

- `crates/kernel/src/policy/patterns/default.rs` — 12 Regex::new().unwrap() calls to fix
- `crates/kernel/src/policy/layer2/injection.rs` — InjectionDetector::default() .expect()
- `crates/kernel/src/policy/layer1/regorus.rs` — .expect("semaphore guarantees") at line 83
- `crates/kernel/src/main.rs` — large bootstrapping block to extract
- `docker/` or root Dockerfiles — container hardening targets
- `docker-compose.yml` — default credential parameterization target

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- HR-OPS-01 — CI quality gates (deny.toml, coverage)
- HR-OPS-02 — Local developer workflows (contributing guide, workspace lints)
- HR-MAINT-01 — Warning/panic reduction

## Scope

### In Scope

- Replace all unwrap/expect in hot-path pattern initialization with infallible or Result-propagating alternatives
- Add cargo-deny configuration and CI integration
- Align rand crate versions across workspace
- Add workspace-level [lints] to root Cargo.toml
- Harden all Dockerfiles (non-root, read-only rootfs)
- Parameterize default credentials in docker-compose
- Extract main.rs bootstrapping into bootstrap.rs
- Add proptest for PII pattern fuzzing
- Add coverage reporting to CI
- Add CONTRIBUTING.md and CHANGELOG.md
- Document Windows ring build workaround

### Out of Scope / Non-Goals

- Functional feature additions
- Architecture changes
- Performance optimization
- New regulatory frameworks
- Dashboard changes

## Technical Constraints

- Rust edition 2024, MSRV supporting std::sync::LazyLock
- Must not break existing 350+ test suite
- Docker changes must preserve multi-stage build optimization

## Integration Points

- GitHub Actions CI — new deny/coverage steps
- Docker Hub / registry — updated container images
- Cargo workspace — unified lints configuration
