# M006: Production Safety & Quality

**Vision:** Eliminate runtime panic paths, close security hygiene gaps, and improve developer experience before pilot deployments.

## Success Criteria

- Zero unwrap/expect calls in hot-path pattern initialization — covers ASSESSMENT P0 items 1-3 (14 Regex unwraps in default.rs, InjectionDetector .expect(), regorus semaphore .expect())
- `cargo deny check` passes with license compliance and duplicate crate detection — closes ASSESSMENT §6 gap
- All 4 Dockerfiles produce non-root containers with read-only rootfs — closes MED-012
- docker-compose.yml contains zero hardcoded credentials — closes MED-007
- Property-based fuzz tests exercise the PII pattern library — closes ASSESSMENT §4 gap
- CI produces code coverage reports — closes ASSESSMENT §6 coverage gap
- CONTRIBUTING.md and CHANGELOG.md exist at repo root — closes ASSESSMENT §8 gap
- Workspace [lints] declared in root Cargo.toml — closes ASSESSMENT §4/§5 gap
- Single rand version (0.9) across workspace — closes ASSESSMENT §5 dependency mismatch

## Key Risks / Unknowns

- LazyLock MSRV — requires Rust 1.80+, must verify current toolchain supports it
- proptest pattern coverage — may surface real bugs in existing pattern library that need fixing
- Windows ring build — dev environment issue, may only be documentable rather than fixable

## Proof Strategy

- LazyLock MSRV → retire in S01 by proving `cargo test --workspace` passes after LazyLock conversion
- proptest bugs → retire in S03 by proving proptest suite passes (and fixing any real bugs found)

## Verification Classes

- Contract verification: `cargo test --workspace`, `cargo deny check`, `cargo clippy --workspace -- -D warnings`
- Integration verification: Docker build + run as non-root, docker-compose up with parameterized credentials
- Operational verification: CI pipeline runs deny, coverage, and all new quality gates
- UAT / human verification: none

## Milestone Definition of Done

This milestone is complete only when all are true:

- All three slices are complete with passing verification
- `cargo test --workspace` passes with zero panics from initialization code
- `cargo deny check` passes in CI
- All Dockerfiles produce hardened images
- docker-compose has no default credentials
- CI includes coverage reporting
- CONTRIBUTING.md and CHANGELOG.md exist

## Requirement Coverage

- Covers: HR-OPS-01, HR-OPS-02, HR-MAINT-01
- Partially covers: none
- Leaves for later: HR-DOC-01 (broader doc accuracy)
- Orphan risks: none

## Slices

- [ ] **S01: Production Safety Panic Elimination** `risk:high` `depends:[]`
  > After this: All 12 Regex::new().unwrap() in default.rs use LazyLock, InjectionDetector::default() is infallible, and regorus.rs semaphore path returns fail-mode verdict instead of panicking. `cargo test --workspace` proves zero panic paths remain.
- [ ] **S02: Security And Dependency Hygiene** `risk:medium` `depends:[S01]`
  > After this: `cargo deny check` passes, rand versions are aligned to 0.9, workspace [lints] are centralized, all Dockerfiles run as non-root with read-only rootfs, and docker-compose has no hardcoded credentials.
- [ ] **S03: Quality And Developer Experience** `risk:low` `depends:[S01]`
  > After this: main.rs bootstrapping is extracted to bootstrap.rs, proptest fuzzes PII patterns, CI reports coverage, CONTRIBUTING.md and CHANGELOG.md exist, and Windows ring build is documented.

## Boundary Map

### S01 → S02

Produces:
- Infallible pattern initialization via LazyLock (no panic paths in hot path)
- Clean `cargo test --workspace` baseline for dependency changes

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- Stable pattern library API for proptest to exercise
- Clean main.rs for bootstrap extraction

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Workspace [lints] configuration that CONTRIBUTING.md can reference
- deny.toml that CI coverage step can depend on

Consumes:
- S01 panic-free initialization (clean test baseline)
