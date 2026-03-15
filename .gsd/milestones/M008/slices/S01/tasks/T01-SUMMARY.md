---
id: T01
parent: S01
milestone: M008
provides:
  - All 45 GitHub Actions uses: references pinned to SHA digests across 3 workflow files
  - Renovate configured to track digest updates for github-actions
key_files:
  - .github/workflows/ci-quality-security.yml
  - .github/workflows/release.yml
  - .github/workflows/release-please.yml
  - renovate.json
key_decisions:
  - Pinned trufflehog to v3.93.8 tag SHA instead of main branch HEAD (deterministic release vs moving target)
  - Pinned dtolnay/rust-toolchain to stable branch HEAD SHA (no tagged releases exist for this action)
  - Used latest available minor/patch versions for all actions at time of pinning
patterns_established:
  - "Format: uses: owner/action@<sha> # <version-tag>"
  - Renovate pinDigests:true ensures digest-pinned actions get automated update PRs
observability_surfaces:
  - "Diagnostic: grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\\{40\\}' — empty means fully pinned"
  - "Counts: grep -cE '@[a-f0-9]{40}' .github/workflows/*.yml — expect 30/14/1"
duration: 20m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Pin all GitHub Actions to SHA digests

**Pinned all 45 GitHub Actions references across 3 workflow files to immutable SHA digests, eliminating mutable tag/branch references.**

## What Happened

Resolved commit SHAs for 19 unique actions using `git ls-remote` against each upstream repository. Replaced all `@main`, `@vN`, and `@0.28.0`-style tag references with `@<40-char-sha> # <version>` format across:

- `ci-quality-security.yml` — 30 action references (2 were `@main`, 28 were `@vN`)
- `release.yml` — 14 action references (1 was `@main`, 13 were `@vN`)
- `release-please.yml` — 1 action reference (`@v4`)

Updated `renovate.json` to add `pinDigests: true` to the github-actions package rule, ensuring Renovate will propose PRs when new action versions are released even with digest pinning.

## Verification

- `grep -c "@main" .github/workflows/*.yml` → 0 across all files ✓
- `grep -cE "@[a-f0-9]{40}" .github/workflows/ci-quality-security.yml` → 30 ✓
- `grep -cE "@[a-f0-9]{40}" .github/workflows/release.yml` → 14 ✓
- `grep -cE "@[a-f0-9]{40}" .github/workflows/release-please.yml` → 1 ✓
- `grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\{40\}'` → empty (no unpinned) ✓
- `yamllint -d relaxed .github/workflows/*.yml` → 0 errors (warnings only: line-length from SHA hashes) ✓

### Slice-level checks (T01 scope)

| Check | Result | Notes |
|-------|--------|-------|
| ci-quality-security.yml SHA count = 30 | ✅ PASS | Was 28 in original plan; actual file has 30 uses: lines |
| release.yml SHA count = 14 | ✅ PASS | |
| release-please.yml SHA count = 1 | ✅ PASS | |
| @main count = 0 | ✅ PASS | |
| yamllint passes | ✅ PASS | Warnings only (line-length) |
| Unpinned diagnostic = empty | ✅ PASS | |
| grep sha256 Dockerfile | ⏳ T02 scope | |
| Docker digest pins | ⏳ T03 scope | |
| deny.toml windows removal | ⏳ T03 scope | |
| cargo deny check | ⏳ T03 scope | |

## Diagnostics

- Run `grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\{40\}'` to check for regression (should be empty)
- Run `grep -cE '@[a-f0-9]{40}' .github/workflows/*.yml` to get per-file pin counts (30/14/1)

## Deviations

- Slice plan originally stated 28 action uses in ci-quality-security.yml — actual count is 30. Updated the plan to match reality.
- Added `## Observability / Diagnostics` section to slice plan per pre-flight requirement.
- Added diagnostic verification check to slice plan per pre-flight requirement.

## Known Issues

None.

## Files Created/Modified

- `.github/workflows/ci-quality-security.yml` — Pinned 30 action references to SHA digests
- `.github/workflows/release.yml` — Pinned 14 action references to SHA digests
- `.github/workflows/release-please.yml` — Pinned 1 action reference to SHA digest
- `renovate.json` — Added `pinDigests: true` to github-actions package rule
- `.gsd/milestones/M008/slices/S01/S01-PLAN.md` — Updated SHA count, added observability section, marked T01 done
- `.gsd/milestones/M008/slices/S01/tasks/T01-PLAN.md` — Created task plan (retroactive)
