# T02: 32-repo-quality-gates-infra-lint-coverage 02

**Slice:** S03 — **Milestone:** M005

## Description

Wire the new infra-quality command surface into GitHub Actions so deployment and repo-config artifacts are merge-blocking, not best-effort.

Purpose: satisfy `HR-OPS-01` by making infra lint/validation first-class CI coverage alongside the existing Rust and JS/TS gates.
Output: a dedicated CI job that installs the required tooling and runs the repo-root infra gate.

## Must-Haves

- [ ] CI explicitly runs infra-quality checks for Docker, shell, Helm, proto, and YAML artifacts.
- [ ] Infra lint failures block the same workflow family that already protects Rust and JS/TS quality.
- [ ] Helm chart validation runs through Helm-native commands rather than treating templates as plain YAML.

## Files

- `.github/workflows/ci-quality-security.yml`
