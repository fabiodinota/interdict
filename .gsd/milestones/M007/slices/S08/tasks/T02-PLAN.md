---
estimated_steps: 7
estimated_files: 2
---

# T02: Operator guide + troubleshooting guide

**Slice:** S08 — Documentation, Accessibility & Polish
**Milestone:** M007

## Description

Create the two primary operator-facing documents: a comprehensive deployment/operations guide and a troubleshooting reference. These are the main deliverables for PR-OPS-01. Follow the voice, structure, and formatting of the existing `docs/operator/full-text-storage.md` — direct, imperative, operator-focused.

## Steps

1. Create `docs/operator/guide.md` with the following sections:
   - **Overview**: What Interdict is, architecture summary (kernel → control plane → dashboard → evidence collector)
   - **Quick Start (Docker Compose)**: `cp env.example .env` → edit secrets → `docker compose up`. Reference env.example's `# CHANGE IN PRODUCTION` markers.
   - **Kubernetes Deployment (Helm)**: `helm install` commands, values.yaml key settings, namespace creation, secret management. Note NetworkPolicy requires CNI (Calico/Cilium) — can disable via `networkPolicy.enabled: false`.
   - **Configuration Reference**: Table of all major env vars from env.example, grouped by component (Kernel, Control Plane, Evidence Collector, Dashboard). Include types, defaults, and required flags.
   - **Certificate Management**: Auto-generated dev CA, production CA replacement, mTLS between services, CA trust script usage.
   - **Signing Key Management**: Dev mode (ephemeral keys), file mode (pre-provisioned Ed25519), key rotation via `reload_from_file()`, KMS integration notes. Reference D014 ArcSwap hot-reload.
   - **Monitoring**: `docker compose --profile monitoring up` for Prometheus+Grafana. Grafana at :3002, Prometheus at :9090. Dashboard auto-provisioned. Note: dev/staging only — production should use dedicated monitoring.
   - **Backup & Restore**: `scripts/backup.sh --dry-run` and `--output-dir`. What's backed up (Postgres config, ClickHouse audit logs). Restore procedure.
   - **Environment Validation**: `scripts/validate-env.sh` pre-flight checks. Integration with `scripts/smoke-test.sh`.
   - **Upgrade Procedures**: Pull new images → restart → verify health. Helm upgrade commands. Breaking change notes (NetworkPolicy now enabled by default).
   - **Cross-references**: Link to `full-text-storage.md`, `troubleshooting.md`, `docs/api/`.

2. Create `docs/operator/troubleshooting.md` with the following sections:
   - **Certificate / mTLS Issues**: Expired certs, CA trust failures, kernel ↔ control-plane mTLS handshake, regenerating certificates.
   - **Database Connectivity**: Postgres connection refused, ClickHouse connection timeout, migration failures.
   - **Evidence Pipeline Failures**: gRPC channel errors between kernel and evidence-collector, ClickHouse write failures, S3/MinIO connectivity.
   - **Policy Distribution Errors**: Kernel not receiving policy updates, gRPC Subscribe stream disconnects, ACK/NACK failures.
   - **Signing Key Issues**: Dev key warnings in production, key rotation failures, KMS connectivity.
   - **CSP Violations**: Browser console `Refused to execute inline script/style`, nonce propagation debugging via `proxy.ts`, dev mode `unsafe-eval`.
   - **Docker Compose Issues**: Port conflicts, volume permissions, monitoring profile not starting.
   - **Helm/Kubernetes Issues**: NetworkPolicy blocking traffic (CNI missing), startupProbe failures (150s timeout), kube-score warnings explanation.
   - **Diagnostic Commands**: Table of key diagnostic commands (`docker logs`, `kubectl logs`, `curl /health`, `scripts/validate-env.sh`).

3. Review both documents for accuracy against S01–S07 deliverables.

## Must-Haves

- [ ] Operator guide covers: Docker Compose, Helm, configuration, certificates, key rotation, monitoring, backup, env validation, upgrades
- [ ] Troubleshooting guide covers: mTLS, DB, evidence pipeline, policy distribution, CSP, signing keys, deployment issues
- [ ] Both docs follow `full-text-storage.md` voice and formatting
- [ ] Configuration section references actual env.example variables
- [ ] Monitoring section documents `--profile monitoring` pattern from S07
- [ ] Backup section documents `scripts/backup.sh` from S07
- [ ] Cross-references between operator docs and API docs

## Verification

- `test -f docs/operator/guide.md && wc -l docs/operator/guide.md | awk '{exit ($1 < 200)}'`
- `test -f docs/operator/troubleshooting.md && wc -l docs/operator/troubleshooting.md | awk '{exit ($1 < 100)}'`
- `grep "backup.sh" docs/operator/guide.md` — backup script documented
- `grep "validate-env" docs/operator/guide.md` — env validation documented
- `grep "monitoring" docs/operator/guide.md` — monitoring documented
- `grep "CSP\|nonce" docs/operator/troubleshooting.md` — CSP troubleshooting included

## Inputs

- `docs/operator/full-text-storage.md` — voice and structure template (163 lines)
- `env.example` — 201-line configuration reference (source of truth for env vars)
- `scripts/backup.sh`, `scripts/validate-env.sh`, `scripts/smoke-test.sh` — S07 operational scripts to document
- `docker-compose.monitoring.yml` — S07 monitoring overlay to document
- `helm/interdict/values.yaml` — Helm configuration to document
- S05 Forward Intelligence: conventional commits, release-please, cosign verification commands
- S06 Forward Intelligence: `proxy.ts` is the middleware entry point (not `middleware.ts`), CSP nonce chain
- S07 Forward Intelligence: kube-score 13 ignore flags, monitoring is dev/staging only, backup requires running containers

## Observability Impact

This task creates static documentation — no runtime signals change. Future agents inspect deliverables via:

- `wc -l docs/operator/guide.md` — line count ≥200 confirms substantive guide
- `wc -l docs/operator/troubleshooting.md` — line count ≥100 confirms substantive troubleshooting doc
- `grep` checks for key topics (backup.sh, validate-env, monitoring, CSP, nonce) confirm section coverage
- Cross-reference links between docs can be validated with `grep -r "troubleshooting.md\|guide.md\|full-text-storage.md" docs/operator/`

No failure state beyond missing/undersized files.

## Expected Output

- `docs/operator/guide.md` — ≥200-line comprehensive operator guide
- `docs/operator/troubleshooting.md` — ≥100-line troubleshooting reference
