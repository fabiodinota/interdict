---
estimated_steps: 6
estimated_files: 7
---

# T02: Add conventional commit enforcement and release-please automation

**Slice:** S05 — CI/CD Release Pipeline + Quality Gates
**Milestone:** M007

## Description

Enforce conventional commit messages via commitlint (local husky hook + CI job) and automate versioning/changelog via release-please. When release-please merges a release PR, it creates a `v*` tag that triggers the release workflow from T01. This closes the automation loop: conventional commits → release-please PR → merge → tag → release workflow → signed images.

## Steps

1. Install `@commitlint/cli` and `@commitlint/config-conventional` as root devDependencies: `npm install --save-dev @commitlint/cli @commitlint/config-conventional`
2. Create `commitlint.config.js` exporting `{ extends: ['@commitlint/config-conventional'] }`
3. Create `.husky/commit-msg` hook with `#!/usr/bin/env sh` + `set -eu` + `npx commitlint --edit "$1"` — must be executable
4. Create `release-please-config.json` with `release-type: simple`, `include-component-in-tag: false`, `changelog-path: CHANGELOG.md`, package `.` config
5. Create `.release-please-manifest.json` with `{ ".": "1.5.0" }` (matching current project version)
6. Create `.github/workflows/release-please.yml` — on push to main, uses `googleapis/release-please-action@v4` with `config-file` and `manifest-file` pointing to the config files. Permissions: `contents: write`, `pull-requests: write`.
7. Add `commitlint` job to `.github/workflows/ci-quality-security.yml` — setup Node 22, install deps, validate commit message with `npx commitlint --from ${{ github.event.pull_request.base.sha || 'HEAD~1' }} --to ${{ github.event.pull_request.head.sha || 'HEAD' }}`

## Must-Haves

- [ ] commitlint validates conventional commit format locally via husky commit-msg hook
- [ ] commitlint CI job validates commit messages on push and PR
- [ ] release-please workflow creates/updates release PRs on push to main
- [ ] release-please config uses `release-type: simple` with correct initial version
- [ ] Husky commit-msg hook works on Windows (Git Bash compatible shebang)

## Verification

- `npx commitlint --from HEAD~1` passes on a well-formed conventional commit
- `.husky/commit-msg` exists and is executable
- `yamllint .github/workflows/release-please.yml` passes
- `.release-please-manifest.json` contains version `"1.5.0"`
- `ci-quality-security.yml` contains `commitlint` job

## Observability Impact

- **Signals changed:** CI workflow now emits commitlint pass/fail per push and PR. release-please workflow emits release PR creation/update events on push to main.
- **How to inspect:** `gh run list --workflow=ci-quality-security.yml` shows commitlint job status. `gh run list --workflow=release-please.yml` shows release PR automation. `gh pr list --label "autorelease: pending"` shows pending release PRs.
- **Failure visibility:** commitlint CI job fails with the offending commit message and conventional-commit violation details. release-please workflow fails with action error logs. Local husky hook rejects non-conventional commits before push.
- **Redaction:** No secrets involved — commitlint uses public npm packages, release-please uses GITHUB_TOKEN.

## Inputs

- `package.json` — existing root package.json with husky devDep
- `.husky/pre-commit`, `.husky/pre-push` — existing hooks (pattern reference for new hook)
- `CHANGELOG.md` — existing manually maintained changelog, release-please will manage going forward
- S05-RESEARCH.md — release-please bootstrap needs manifest + config files; commitlint CI validates range on PR, last commit on push

## Expected Output

- `commitlint.config.js` — commitlint configuration
- `.husky/commit-msg` — husky hook invoking commitlint
- `package.json` — updated with commitlint devDependencies
- `.release-please-manifest.json` — version manifest
- `release-please-config.json` — release-please configuration
- `.github/workflows/release-please.yml` — release-please workflow
- `.github/workflows/ci-quality-security.yml` — modified with commitlint job
