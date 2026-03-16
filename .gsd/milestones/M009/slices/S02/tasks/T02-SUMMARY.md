---
id: T02
parent: S02
milestone: M009
provides:
  - interdict.validateRequired Helm helper that fail-closes on empty credentials without existingSecret
  - DATABASE_URL removed from control-plane ConfigMap (single source in Deployment env)
  - signing-keys volume mount readOnly in evidence-collector
  - busybox:1.36 pinned to manifest-list digest sha256:b9598f8c98e2... in all 4 init containers
key_files:
  - helm/interdict/templates/_helpers.tpl
  - helm/interdict/templates/control-plane/deployment.yaml
  - helm/interdict/templates/control-plane/configmap.yaml
  - helm/interdict/templates/evidence-collector/deployment.yaml
  - helm/interdict/templates/kernel/deployment.yaml
  - helm/interdict/templates/dashboard/deployment.yaml
key_decisions:
  - Validation calls placed at top of control-plane/deployment.yaml (not a separate template) — simplest approach, only one deployment needs credential access
patterns_established:
  - interdict.validateRequired helper pattern reusable for any future required-credential checks
observability_surfaces:
  - "helm template" emits fail message naming the missing credential (e.g. "postgresql.auth.password is required — set it via --set or provide existingSecret")
  - readOnly mount violation surfaces as EROFS in container logs
  - Digest pin mismatch surfaces as ErrImagePull in pod events
duration: 20m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Add Helm credential validation, ConfigMap cleanup, and image hardening

**Helm chart now fail-closes on empty credentials, removes duplicate DATABASE_URL from ConfigMap, enforces read-only signing-keys mount, and pins all busybox init images by manifest-list digest.**

## What Happened

Four hardening items applied to the Helm chart:

1. **validateRequired helper** — Added `interdict.validateRequired` named template to `_helpers.tpl`. Uses Helm `fail` to abort rendering when a credential value is empty and no `existingSecret` is provided. Validation calls for `postgresql.auth.password` and `minio.auth.rootPassword` placed at the top of `control-plane/deployment.yaml` before the `apiVersion:` line.

2. **ConfigMap cleanup** — Removed the `DATABASE_URL` line from `control-plane/configmap.yaml`. The Deployment already constructs `DATABASE_URL` in its `env:` section using `$(POSTGRES_PASSWORD)` variable expansion. No other templates referenced the ConfigMap version.

3. **readOnly volume mount** — Added `readOnly: true` to the `signing-keys` volumeMount in `evidence-collector/deployment.yaml`, matching the pattern already used by the `certs` mount.

4. **Busybox digest pinning** — Resolved manifest-list digest for `busybox:1.36` via `docker buildx imagetools inspect`: `sha256:b9598f8c98e24d0ad42c1742c32516772c3aa2151011ebaf639089bd18c605b8`. Applied to all four deployment templates (control-plane, evidence-collector, kernel, dashboard). Per D044, this is the manifest-list digest (not per-architecture), letting Docker select the correct platform at pull time.

## Verification

- `helm lint helm/interdict` — exits 0, 1 chart linted, 0 failed
- `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password=test --set minio.auth.rootPassword=test` — renders successfully (exit 0)
- `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password=""` — exits 1, error: `postgresql.auth.password is required — set it via --set or provide existingSecret`
- `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password=test --set minio.auth.rootPassword=""` — exits 1, error: `minio.auth.rootPassword is required — set it via --set or provide existingSecret`
- `helm template ... --set postgresql.auth.existingSecret=my-pg-secret --set minio.auth.existingSecret=my-minio-secret` — renders successfully (existingSecret bypass works)
- `rg "DATABASE_URL" helm/interdict/templates/control-plane/configmap.yaml` — no matches
- `rg "readOnly: true" helm/interdict/templates/evidence-collector/deployment.yaml` — matches both certs and signing-keys mounts
- `rg "busybox:1.36@sha256:" helm/interdict/templates/` — matches all four deployment templates

**Slice-level verification (Helm-related checks):**
- ✅ `helm lint helm/interdict` — clean
- ✅ `helm template ... --set postgresql.auth.password=test --set minio.auth.rootPassword=test` — renders
- ✅ `helm template ... --set postgresql.auth.password=""` — fails with credential name
- ✅ `rg "readOnly: true" ...evidence-collector/deployment.yaml` — matches
- ⏳ `npx vitest run` — not applicable to this task (T01 covered)
- ⏳ `bun test` — not applicable to this task (T03 scope)
- ⏳ `docker compose config` — not applicable to this task (T03 scope)

## Diagnostics

- Run `helm template interdict helm/interdict` with empty credentials to see validation error messages naming the specific missing field
- `readOnly: true` violations produce EROFS write errors in container logs at runtime
- Digest pin mismatches surface as `ErrImagePull` in pod events (`kubectl describe pod`)

## Deviations

- Helm v4.1.1 requires `--dependency-update` flag for `helm template` when charts/ directory isn't pre-populated. `helm dependency build` downloads tgz files but Helm v4's dependency resolver still reports them missing without the flag. Verification commands in the plan needed this flag added. This is a local tooling behavior — CI workflows typically run `helm dependency build` in a separate step before `helm template`.

## Known Issues

- None

## Files Created/Modified

- `helm/interdict/templates/_helpers.tpl` — Added `interdict.validateRequired` named template
- `helm/interdict/templates/control-plane/deployment.yaml` — Added validation calls at top, pinned busybox digest
- `helm/interdict/templates/control-plane/configmap.yaml` — Removed duplicate `DATABASE_URL` line
- `helm/interdict/templates/evidence-collector/deployment.yaml` — Added `readOnly: true` to signing-keys mount, pinned busybox digest
- `helm/interdict/templates/kernel/deployment.yaml` — Pinned busybox digest
- `helm/interdict/templates/dashboard/deployment.yaml` — Pinned busybox digest
- `.gsd/milestones/M009/slices/S02/tasks/T02-PLAN.md` — Added Observability Impact section (pre-flight fix)
