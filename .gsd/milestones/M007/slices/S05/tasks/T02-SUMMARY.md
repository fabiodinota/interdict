---
id: T02
parent: S05
milestone: M007
provides:
  - commitlint conventional commit enforcement (local husky hook + CI job)
  - release-please automation (config, manifest, workflow)
key_files:
  - commitlint.config.js
  - .husky/commit-msg
  - package.json
  - .release-please-manifest.json
  - release-please-config.json
  - .github/workflows/release-please.yml
  - .github/workflows/ci-quality-security.yml
key_decisions:
  - "D032: release-please (simple mode) over manual changelog + standard-version"
patterns_established:
  - "Husky commit-msg hook pattern: #!/usr/bin/env sh + set -eu + npx commitlint --edit (Git Bash compatible)"
  - "CI commitlint validates range on PR (base..head), last commit on push (HEAD~1..HEAD)"
  - "release-please config+manifest pair: release-please-config.json + .release-please-manifest.json"
observability_surfaces:
  - "gh run list --workflow=ci-quality-security.yml — commitlint job pass/fail"
  - "gh run list --workflow=release-please.yml — release PR creation/update"
  - "gh pr list --label 'autorelease: pending' — pending release PRs"
duration: 10m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Add conventional commit enforcement and release-please automation

**Installed commitlint with husky commit-msg hook and CI job, plus release-please workflow for automated versioning/changelog/tag creation**

## What Happened

1. Installed `@commitlint/cli` and `@commitlint/config-conventional` as root devDependencies.
2. Created `commitlint.config.js` extending the conventional config.
3. Created `.husky/commit-msg` hook invoking `npx commitlint --edit "$1"` — follows existing hook shebang pattern (`#!/usr/bin/env sh` + `set -eu`), Git Bash compatible on Windows.
4. Created `release-please-config.json` with `release-type: simple`, `include-component-in-tag: false`, `changelog-path: CHANGELOG.md`, package `.` config.
5. Created `.release-please-manifest.json` with `{ ".": "1.5.0" }` matching current project version.
6. Created `.github/workflows/release-please.yml` — triggered on push to main, uses `googleapis/release-please-action@v4` with config-file and manifest-file. Permissions: `contents: write`, `pull-requests: write`.
7. Added `commitlint` job to `.github/workflows/ci-quality-security.yml` — checks out with `fetch-depth: 0` for full history, sets up Node 22, installs deps, validates commit range (PR base..head on PRs, HEAD~1..HEAD on push).
8. Fixed pre-flight observability gap in T02-PLAN.md.

## Verification

- `npx commitlint --from HEAD~1` — **PASS** (exit 0, last commit is conventional)
- `.husky/commit-msg` exists — **PASS**
- `python -m yamllint .github/workflows/release-please.yml` — **PASS** (valid YAML)
- `python -m yamllint .github/workflows/ci-quality-security.yml` — **PASS** (valid YAML)
- `.release-please-manifest.json` contains `"1.5.0"` — **PASS**
- `ci-quality-security.yml` contains `commitlint` job — **PASS** (3 occurrences)

### Slice-level checks (T02-relevant)
- ✅ `yamllint .github/workflows/release-please.yml` passes
- ✅ `npx commitlint --from HEAD~1` validates most recent commit
- ✅ `.husky/commit-msg` hook exists and invokes commitlint
- ✅ `.release-please-manifest.json` and `release-please-config.json` exist

### Slice-level checks (T03-scoped, not yet expected)
- ⬜ `secret-scanning` job — T03
- ⬜ `benchmarks` job — T03
- ⬜ `.github/CODEOWNERS` — T03
- ⬜ `.github/PULL_REQUEST_TEMPLATE.md` — T03

## Diagnostics

- **Commitlint CI:** `gh run list --workflow=ci-quality-security.yml` — commitlint job will show pass/fail with violation details
- **Release-please:** `gh run list --workflow=release-please.yml` — shows PR creation events; `gh pr list --label "autorelease: pending"` for pending release PRs
- **Local hook:** Non-conventional commit messages rejected at `git commit` time with detailed format error
- **Automation loop:** conventional commit → push to main → release-please creates/updates release PR → merge PR → release-please creates `v*` tag → T01's release.yml triggers → signed images

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `commitlint.config.js` — commitlint configuration extending @commitlint/config-conventional
- `.husky/commit-msg` — husky hook invoking commitlint on commit messages
- `package.json` — added @commitlint/cli and @commitlint/config-conventional devDependencies
- `.release-please-manifest.json` — version manifest with initial version 1.5.0
- `release-please-config.json` — release-please configuration (simple release type)
- `.github/workflows/release-please.yml` — release-please GitHub Actions workflow
- `.github/workflows/ci-quality-security.yml` — added commitlint CI job
- `.gsd/milestones/M007/slices/S05/tasks/T02-PLAN.md` — added Observability Impact section
