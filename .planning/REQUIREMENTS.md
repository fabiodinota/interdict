# Requirements: Interdict.io

**Defined:** 2026-03-11
**Core Value:** Every AI action an employee takes is routed through a policy-enforcing kernel -- logged, signed, and regulatorily mapped -- before it reaches any model

## Current Requirement Source of Truth

- v1.0 archived requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
- v1.1 archived requirements: `.planning/milestones/v1.1-REQUIREMENTS.md`
- Product/platform baseline: `.planning/PROJECT.md`

This file tracks the currently active hardening requirements for the next milestone.

## v1.4 Requirements

### Secret, Session, and Seed Hardening

- [x] **HR-SEC-01**: No operational or bootstrap flow intentionally prints plaintext API keys, secrets, or equivalent credential material to logs/stdout.
- [x] **HR-AUTH-01**: Dashboard auth route handlers validate request bodies at the server boundary before using input data.
- [x] **HR-AUTH-02**: Dashboard session management uses a dedicated session primitive rather than persisting raw API keys in long-lived cookies.

### Distribution TLS and Evidence Query Scale

- [x] **HR-DIST-01**: Kernel distribution TLS server identity is deployment-configurable and not hard-coded to a single hostname.
- [x] **HR-EVID-01**: ClickHouse reads against `evidence_bundles` use partition-friendly date filters in operator-facing and verification-sensitive flows.

### Repo Quality Gates and Infra Coverage

- [ ] **HR-OPS-01**: Docker, Helm, proto, shell, and YAML artifacts have explicit lint/validation coverage in CI.
- [ ] **HR-OPS-02**: Local developer workflows clearly automate or document quality checks across Windows + WSL Rust and JS/TS surfaces.

### Warning Burn-Down and Project Truth

- [ ] **HR-MAINT-01**: Remaining production-code warnings are reduced or intentionally documented, and framework migration warnings are resolved.
- [ ] **HR-DOC-01**: Planning/state docs and tracked local config accurately reflect the repo's verified state.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HR-SEC-01 | Phase 30 | Complete |
| HR-AUTH-01 | Phase 30 | Complete |
| HR-AUTH-02 | Phase 30 | Complete |
| HR-DIST-01 | Phase 31 | Complete |
| HR-EVID-01 | Phase 31 | Complete |
| HR-OPS-01 | Phase 32 | Planned |
| HR-OPS-02 | Phase 32 | Planned |
| HR-MAINT-01 | Phase 33 | Planned |
| HR-DOC-01 | Phase 33 | Planned |

**Coverage:**
- Active v1.4 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0

---
*Last updated: 2026-03-11 -- Phase 31 requirements verified in working tree*
