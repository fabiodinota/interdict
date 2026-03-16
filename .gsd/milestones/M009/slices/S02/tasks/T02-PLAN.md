---
estimated_steps: 6
estimated_files: 8
---

# T02: Add Helm credential validation, ConfigMap cleanup, and image hardening

**Slice:** S02 — Security Hardening — Proxy, Helm, Secrets
**Milestone:** M009

## Description

Multiple Helm chart hardening items: (1) `helm template` silently renders with empty database/minio passwords — add a `validateRequired` helper that fails the render. (2) `DATABASE_URL` is duplicated in both the ConfigMap and Deployment env spec — remove it from ConfigMap. (3) `signing_keys` volume mount on evidence-collector lacks `readOnly: true`. (4) All four init container images use `busybox:1.36` by mutable tag — pin to manifest-list digest per D044.

## Steps

1. **Add `interdict.validateRequired` helper in `_helpers.tpl`.** Append a new named template at the bottom of `helm/interdict/templates/_helpers.tpl`:
   ```
   {{/*
   Validate that a required credential is provided either as a value or via existingSecret.
   Usage: {{ include "interdict.validateRequired" (dict "name" "postgresql.auth.password" "value" .Values.postgresql.auth.password "existingSecret" .Values.postgresql.auth.existingSecret) }}
   */}}
   {{- define "interdict.validateRequired" -}}
   {{- if and (not .value) (not .existingSecret) -}}
   {{- fail (printf "%s is required — set it via --set or provide existingSecret" .name) -}}
   {{- end -}}
   {{- end -}}
   ```

2. **Invoke the helper from a template.** Add validation calls at the top of `helm/interdict/templates/control-plane/deployment.yaml` (before the Deployment spec), wrapped in a comment block:
   ```
   {{- include "interdict.validateRequired" (dict "name" "postgresql.auth.password" "value" .Values.postgresql.auth.password "existingSecret" .Values.postgresql.auth.existingSecret) -}}
   {{- include "interdict.validateRequired" (dict "name" "minio.auth.rootPassword" "value" .Values.minio.auth.rootPassword "existingSecret" .Values.minio.auth.existingSecret) -}}
   ```
   Place these at the very top of the file before `apiVersion:`. They produce no output (the helper is a validation-only template) but cause `helm template` to fail if the constraint is violated.

3. **Remove `DATABASE_URL` from ConfigMap.** In `helm/interdict/templates/control-plane/configmap.yaml`, delete the line:
   ```
   DATABASE_URL: "postgres://{{ .Values.postgresql.auth.username }}:$(POSTGRES_PASSWORD)@{{ .Release.Name }}-postgresql:5432/{{ .Values.postgresql.auth.database }}"
   ```
   The Deployment already constructs `DATABASE_URL` in its `env:` section (confirmed at lines ~60-61). Verify no other template references the ConfigMap's `DATABASE_URL` by grepping.

4. **Add `readOnly: true` to signing-keys volume mount.** In `helm/interdict/templates/evidence-collector/deployment.yaml`, find the `signing-keys` volumeMount (currently just `name` and `mountPath`) and add `readOnly: true`:
   ```yaml
            - name: signing-keys
              mountPath: /data/keys
              readOnly: true
   ```

5. **Pin busybox to manifest-list digest.** Resolve the digest for `busybox:1.36`:
   ```bash
   docker buildx imagetools inspect busybox:1.36 --format '{{.Manifest.Digest}}'
   ```
   If that command isn't available, use:
   ```bash
   docker manifest inspect busybox:1.36 | python3 -c "import sys,json; print(json.load(sys.stdin).get('manifests',[{}])[0].get('digest',''))"
   ```
   Or as a last resort, look up the digest from Docker Hub web UI for `busybox:1.36`.

   In all four deployment templates, replace:
   ```
   image: busybox:1.36
   ```
   with:
   ```
   image: busybox:1.36@sha256:<manifest-list-digest>
   ```
   Files: `helm/interdict/templates/control-plane/deployment.yaml`, `helm/interdict/templates/evidence-collector/deployment.yaml`, `helm/interdict/templates/kernel/deployment.yaml`, `helm/interdict/templates/dashboard/deployment.yaml`.

6. **Verify all changes.** Run:
   ```bash
   helm lint helm/interdict
   helm dependency build helm/interdict 2>/dev/null; helm template interdict helm/interdict --set postgresql.auth.password=test --set minio.auth.rootPassword=test
   helm template interdict helm/interdict --set postgresql.auth.password="" 2>&1 | head -5  # should fail
   helm template interdict helm/interdict --set postgresql.auth.password=test --set minio.auth.rootPassword="" 2>&1 | head -5  # should fail
   rg "readOnly: true" helm/interdict/templates/evidence-collector/deployment.yaml
   rg "DATABASE_URL" helm/interdict/templates/control-plane/configmap.yaml  # should return nothing
   ```

## Must-Haves

- [ ] `interdict.validateRequired` helper exists in `_helpers.tpl`
- [ ] `helm template` with empty `postgresql.auth.password` (and no `existingSecret`) fails with clear error
- [ ] `helm template` with empty `minio.auth.rootPassword` (and no `existingSecret`) fails with clear error
- [ ] `helm template` with both passwords set renders successfully
- [ ] `DATABASE_URL` removed from control-plane ConfigMap
- [ ] `signing-keys` volumeMount in evidence-collector has `readOnly: true`
- [ ] All four busybox init container images pinned by manifest-list digest

## Verification

- `helm lint helm/interdict` — exits 0
- `helm template interdict helm/interdict --set postgresql.auth.password=test --set minio.auth.rootPassword=test` — renders without error
- `helm template interdict helm/interdict --set postgresql.auth.password=""` — exits non-zero with error mentioning `postgresql.auth.password`
- `helm template interdict helm/interdict --set postgresql.auth.password=test --set minio.auth.rootPassword=""` — exits non-zero with error mentioning `minio.auth.rootPassword`
- `rg "DATABASE_URL" helm/interdict/templates/control-plane/configmap.yaml` — no matches
- `rg "readOnly: true" helm/interdict/templates/evidence-collector/deployment.yaml` — matches signing-keys mount
- `rg "busybox:1.36@sha256:" helm/interdict/templates/` — matches all four deployments

## Observability Impact

- **Helm validation failures:** `helm template` emits `fail` messages with the specific missing credential name (e.g. `postgresql.auth.password is required — set it via --set or provide existingSecret`). These surface in CI pipeline output and local `helm template` / `helm install --dry-run` runs. A future agent can verify enforcement by running `helm template` with empty credentials and checking for non-zero exit.
- **ConfigMap cleanup:** No new signals — removes a duplicate `DATABASE_URL` that was shadowed by the Deployment env spec. Eliminates a confusing dual-source for that value.
- **readOnly volume mount:** No runtime signal change — prevents accidental writes to signing-keys at the kubelet layer. Violation would surface as EROFS write errors in container logs.
- **Image digest pinning:** No runtime signal change — ensures deterministic image pulls. Digest mismatch would surface as `ErrImagePull` in pod events.

## Inputs

- `helm/interdict/templates/_helpers.tpl` — existing helpers (fullname, labels, selectorLabels, serviceAccountName). Append new helper at bottom.
- `helm/interdict/templates/control-plane/configmap.yaml` — contains `DATABASE_URL` line to remove.
- `helm/interdict/templates/control-plane/deployment.yaml` — already has `DATABASE_URL` in env spec at ~line 60. Place validation calls at top of file.
- `helm/interdict/templates/evidence-collector/deployment.yaml` — `signing-keys` volumeMount lacks `readOnly: true`. Certs mount already has it — match that pattern.
- `helm/interdict/values.yaml` — `postgresql.auth.password: ""`, `postgresql.auth.existingSecret: ""`, `minio.auth.rootPassword: ""`, `minio.auth.existingSecret: ""`.
- D044: Docker base images pinned by manifest-list digest, not per-architecture digest.

## Expected Output

- `helm/interdict/templates/_helpers.tpl` — extended with `interdict.validateRequired` named template
- `helm/interdict/templates/control-plane/deployment.yaml` — validation calls at top, busybox pinned
- `helm/interdict/templates/control-plane/configmap.yaml` — `DATABASE_URL` line removed
- `helm/interdict/templates/evidence-collector/deployment.yaml` — signing-keys readOnly, busybox pinned
- `helm/interdict/templates/kernel/deployment.yaml` — busybox pinned
- `helm/interdict/templates/dashboard/deployment.yaml` — busybox pinned
