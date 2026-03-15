---
id: T02
parent: S08
milestone: M007
provides:
  - Comprehensive operator deployment/operations guide (578 lines)
  - Troubleshooting reference covering 9 problem categories (417 lines)
key_files:
  - docs/operator/guide.md
  - docs/operator/troubleshooting.md
key_decisions:
  - Mirrored full-text-storage.md voice: direct imperative, tables for structured data, code blocks for commands, blockquotes for warnings
  - Grouped env vars by component in configuration reference (7 groups matching env.example structure)
patterns_established:
  - Operator doc voice: imperative second-person, symptom → cause → fix troubleshooting pattern, cross-reference footer in all operator docs
observability_surfaces:
  - none (static documentation — no runtime signals)
duration: 18m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Operator guide + troubleshooting guide

**Created 578-line operator guide and 417-line troubleshooting reference covering Docker Compose, Helm, all env vars, certificates, key rotation, monitoring, backup, CSP, and 9 diagnostic categories**

## What Happened

Created two operator-facing documents following the voice and structure of the existing `docs/operator/full-text-storage.md`:

**`docs/operator/guide.md` (578 lines)** covers:
- Overview with architecture table (kernel → control plane → dashboard → evidence collector)
- Quick Start (Docker Compose) with credential generation commands
- Kubernetes Deployment (Helm) with secret management and NetworkPolicy CNI requirements
- Configuration Reference — 7 tables grouping all major env vars from env.example by component (Database, ClickHouse, MinIO, Kernel, Control Plane, Evidence Collector, mTLS, SAML, Signing Keys)
- Certificate Management — proxy CA (dynamic TLS) and internal mTLS (cert-init), production replacement
- Signing Key Management — dev/file/kms modes, rotation workflow via API, ArcSwap hot-reload (D014)
- Monitoring — `--profile monitoring` pattern, Prometheus :9090, Grafana :3002, dev/staging only
- Backup & Restore — `scripts/backup.sh --dry-run` / `--output-dir`, restore commands for Postgres and ClickHouse
- Environment Validation — `scripts/validate-env.sh` checks, integration with `scripts/smoke-test.sh`
- Upgrade Procedures — Docker Compose pull/restart, Helm upgrade, v1.5 breaking changes (NetworkPolicy default)
- Health Checks table, Security Hardening summary, Cross-references

**`docs/operator/troubleshooting.md` (417 lines)** covers:
- Certificate / mTLS Issues — expired certs, CA mismatch, proxy CA trust
- Database Connectivity — Postgres refused, ClickHouse timeout, migration failures
- Evidence Pipeline Failures — gRPC errors, ClickHouse writes, S3/MinIO connectivity
- Policy Distribution Errors — subscription failures, ACK/NACK diagnostics
- Signing Key Issues — dev mode warnings, rotation polling, hot-reload verification
- CSP Violations — nonce debugging via `proxy.ts` (not `middleware.ts`), `strict-dynamic`, `unsafe-eval` in dev
- Docker Compose Issues — port conflicts, volume permissions, monitoring profile activation
- Helm/Kubernetes Issues — NetworkPolicy CNI requirement, startupProbe timeouts, kube-score ignore explanations
- Diagnostic Commands — 14-row reference table of key operational commands

## Verification

All task-level checks pass:
- `wc -l docs/operator/guide.md` → 578 (≥200 ✓)
- `wc -l docs/operator/troubleshooting.md` → 417 (≥100 ✓)
- `grep "backup.sh" docs/operator/guide.md` → 4 matches ✓
- `grep "validate-env" docs/operator/guide.md` → 5 matches ✓
- `grep "monitoring" docs/operator/guide.md` → 11 matches ✓
- `grep "CSP\|nonce" docs/operator/troubleshooting.md` → 12 matches ✓
- Cross-references between guide, troubleshooting, full-text-storage, rest.md, grpc.md ✓
- `--profile monitoring` pattern documented ✓

Slice-level checks passing after T02:
- ✅ `docs/operator/guide.md` exists with ≥200 lines
- ✅ `docs/operator/troubleshooting.md` exists with ≥100 lines
- ⏳ `docs/api/rest.md` and `docs/api/grpc.md` — future task (T03)
- ⏳ README references `docs/operator` — future task (T04/T05)
- ⏳ PROJECT.md reflects v1.5 — future task (T04/T05)

## Diagnostics

Static documentation — inspect with:
- `wc -l docs/operator/guide.md docs/operator/troubleshooting.md` — line counts
- `grep -r "troubleshooting.md\|guide.md\|full-text-storage.md" docs/operator/` — cross-reference integrity

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `docs/operator/guide.md` — 578-line comprehensive operator guide (deployment, config, operations)
- `docs/operator/troubleshooting.md` — 417-line troubleshooting reference (9 problem categories + diagnostic table)
- `.gsd/milestones/M007/slices/S08/tasks/T02-PLAN.md` — Added Observability Impact section (pre-flight fix)
