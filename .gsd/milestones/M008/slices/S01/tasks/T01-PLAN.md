# T01: Pin all GitHub Actions to SHA digests

**Estimate:** 30m

## Why
H-01 — `cosign-installer@main` and `trufflehog@main` are the highest supply chain risk. All other `@v4`/`@v2` tags are also mutable.

## Files
- `.github/workflows/ci-quality-security.yml`
- `.github/workflows/release.yml`
- `.github/workflows/release-please.yml`
- `renovate.json`

## Steps
- [x] For each `uses:` line, look up the current commit SHA for the specified version tag
- [x] Replace `@main` and `@vN` with `@<40-char-sha>` and add a `# vN` comment suffix
- [x] Update renovate.json to include `pinDigests: true` for github-actions group

## Verify
- `grep -c "@main" .github/workflows/*.yml` returns 0
- `yamllint -d relaxed .github/workflows/*.yml` passes
- Zero mutable branch/tag references remain in any workflow file
