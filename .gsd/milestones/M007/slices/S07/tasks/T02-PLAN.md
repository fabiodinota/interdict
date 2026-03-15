---
estimated_steps: 4
estimated_files: 7
---

# T02: Add Helm startupProbe and kube-score CI integration

**Slice:** S07 — DevOps & Deployment Maturity
**Milestone:** M007

## Description

kube-score is the standard Kubernetes manifest linter and it's not in our CI or local quality checks. All 4 Helm deployment templates lack `startupProbe`, which kube-score will flag. This task adds startupProbe to each deployment (matching existing probe patterns), installs kube-score in CI, and adds it to the local infra-check.sh script so both CI and local runs benefit.

## Steps

1. **Add startupProbe to all 4 deployment templates** — Each deployment already has readinessProbe and livenessProbe. Add startupProbe using the same check mechanism (tcpSocket for kernel/evidence-collector, httpGet for control-plane/dashboard) with generous `failureThreshold` × `periodSeconds` to accommodate slow starts (kernel CA generation, control-plane migrations). Use `failureThreshold: 30` and `periodSeconds: 5` (= 150s startup window).

2. **Install kube-score in CI infra-quality job** — Add a step to `.github/workflows/ci-quality-security.yml` in the `infra-quality` job that downloads kube-score (pinned version, e.g., v1.18.0) after Helm setup. Use a curl+chmod pattern consistent with the hadolint install step.

3. **Add kube-score to CI infra-quality job** — Add a step after kube-score install that runs `helm template interdict helm/interdict | kube-score score --ignore-test container-image-pull-policy --ignore-test pod-topology-spread-constraints -`. The `--ignore-test` flags suppress checks that conflict with Helm patterns (image tags default to appVersion) and topology spread (single-node dev clusters).

4. **Add kube-score to infra-check.sh** — In the `render_helm_chart()` function, after `helm template interdict "$tmp_chart" >/dev/null`, add a kube-score step that runs the same scoring command. Guard with `command -v kube-score` so local devs without kube-score installed get a warning, not a failure. In CI the previous step ensures kube-score is available.

## Must-Haves

- [ ] All 4 deployment templates have startupProbe
- [ ] kube-score installed in CI with pinned version
- [ ] kube-score runs on helm template output in CI
- [ ] kube-score integrated into infra-check.sh (with graceful skip when not installed)
- [ ] `helm template | kube-score score` passes with ignore flags

## Verification

- `grep -c "startupProbe" helm/interdict/templates/*/deployment.yaml` returns 4
- `helm template interdict helm/interdict | kube-score score --ignore-test container-image-pull-policy --ignore-test pod-topology-spread-constraints -` passes (requires kube-score installed)
- `grep "kube-score" .github/workflows/ci-quality-security.yml` finds install+run steps
- `grep "kube-score" scripts/quality/infra-check.sh` finds scoring integration
- `yamllint -d relaxed .github/workflows/ci-quality-security.yml` passes

## Observability Impact

- **CI signal:** kube-score step in `infra-quality` job fails with specific check name + remediation guidance when Helm manifests violate best practices — visible in GHA step output.
- **Local signal:** `bash scripts/quality/infra-check.sh` includes kube-score when installed; prints warning and skips gracefully when not installed. Devs see pass/fail inline.
- **Inspection:** `helm template interdict helm/interdict | kube-score score --ignore-test container-image-pull-policy --ignore-test pod-topology-spread-constraints -` can be run manually to inspect all kube-score findings.
- **Failure state:** kube-score CI failure blocks merge; each failing check shows the object name, check ID, and a short remediation message.

## Inputs

- `helm/interdict/templates/*/deployment.yaml` — existing templates with readinessProbe and livenessProbe but no startupProbe
- `helm/interdict/values.yaml` — probe port references and service configuration
- `.github/workflows/ci-quality-security.yml` — infra-quality job with Helm already set up
- `scripts/quality/infra-check.sh` — `render_helm_chart()` function runs helm lint + template

## Expected Output

- `helm/interdict/templates/kernel/deployment.yaml` — startupProbe added
- `helm/interdict/templates/control-plane/deployment.yaml` — startupProbe added
- `helm/interdict/templates/evidence-collector/deployment.yaml` — startupProbe added
- `helm/interdict/templates/dashboard/deployment.yaml` — startupProbe added
- `.github/workflows/ci-quality-security.yml` — kube-score install + run steps in infra-quality job
- `scripts/quality/infra-check.sh` — kube-score in render_helm_chart()
