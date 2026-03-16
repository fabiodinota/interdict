# T04: CI SHA256 checksums and Dockerfile layer optimization

## Description

Add SHA256 integrity verification to hadolint and kube-score downloads in the CI workflow, and improve Docker layer caching in the control-plane Dockerfile. Closes assessment findings L-16, L-17 (unverified CI downloads) and L-18 (suboptimal Dockerfile layering).

## Steps

### CI SHA256 checksums

1. Open `.github/workflows/ci-quality-security.yml`. Locate the "Install hadolint" step (around line 106).

2. **Get the real SHA256 for hadolint v2.12.0 Linux x86_64.** Look it up from the official GitHub release page: `https://github.com/hadolint/hadolint/releases/tag/v2.12.0`. The checksums are published in the release assets. If you can't access the release page, download the binary and compute: `curl -fsSL "https://github.com/hadolint/hadolint/releases/download/v2.12.0/hadolint-Linux-x86_64" | sha256sum`. **Do NOT hardcode a made-up hash.**

3. Modify the hadolint install step to include SHA256 verification:
   ```yaml
   - name: Install hadolint
     run: |
       HADOLINT_VERSION=v2.12.0
       HADOLINT_SHA256=<real-sha256-here>
       curl -fsSL "https://github.com/hadolint/hadolint/releases/download/${HADOLINT_VERSION}/hadolint-Linux-x86_64" -o hadolint
       echo "${HADOLINT_SHA256}  hadolint" | sha256sum -c -
       chmod +x hadolint
       sudo mv hadolint /usr/local/bin/hadolint
   ```

4. **Get the real SHA256 for kube-score v1.18.0 linux_amd64 tarball.** Look it up from `https://github.com/zegl/kube-score/releases/tag/v1.18.0`. If checksums aren't published, download and compute: `curl -fsSL "https://github.com/zegl/kube-score/releases/download/v1.18.0/kube-score_1.18.0_linux_amd64.tar.gz" | sha256sum`. **Do NOT hardcode a made-up hash.**

5. Modify the kube-score install step to include SHA256 verification:
   ```yaml
   - name: Install kube-score
     run: |
       KUBESCORE_VERSION=v1.18.0
       KUBESCORE_SHA256=<real-sha256-here>
       curl -fsSL "https://github.com/zegl/kube-score/releases/download/${KUBESCORE_VERSION}/kube-score_${KUBESCORE_VERSION#v}_linux_amd64.tar.gz" -o kube-score.tar.gz
       echo "${KUBESCORE_SHA256}  kube-score.tar.gz" | sha256sum -c -
       tar xzf kube-score.tar.gz kube-score
       chmod +x kube-score
       sudo mv kube-score /usr/local/bin/kube-score
       rm kube-score.tar.gz
   ```

### Dockerfile layer optimization

6. Open `docker/control-plane/Dockerfile`. The current dependency install (lines 48-49) is:
   ```dockerfile
   COPY control-plane/package.json control-plane/bun.lock ./
   RUN bun install --frozen-lockfile
   ```

   Replace with a two-phase install that separates production deps (stable, cached) from dev deps (needed for drizzle-kit migrations):
   ```dockerfile
   # Install production dependencies first (cached layer — changes rarely)
   COPY control-plane/package.json control-plane/bun.lock ./
   RUN bun install --production --frozen-lockfile

   # Copy source code
   COPY control-plane/ .

   # Install remaining devDependencies (drizzle-kit needed for entrypoint migrations)
   RUN bun install --frozen-lockfile
   ```

   This way, source code changes don't invalidate the production dependency layer. The second `bun install` is a fast incremental install that only adds dev deps.

   **Important:** Move the `COPY control-plane/ .` line between the two installs. The current structure has it after the single install — move it between.

7. Verify the Dockerfile still builds valid syntax by checking `docker compose config` still references it correctly.

## Must-Haves

- hadolint download has SHA256 verification with `sha256sum -c`
- kube-score download has SHA256 verification with `sha256sum -c`
- SHA256 values are real checksums from official releases (not fabricated)
- Control-plane Dockerfile has two-phase `bun install` (production first, then full)
- All YAML remains syntactically valid

## Verification

```bash
# CI workflow has sha256sum verification
grep -c "sha256sum -c" .github/workflows/ci-quality-security.yml  # should return 2
# Dockerfile has two bun install commands
grep -c "bun install" docker/control-plane/Dockerfile  # should return 2
# Docker Compose still valid
docker compose config >/dev/null
```

## Inputs

- `.github/workflows/ci-quality-security.yml` lines 106-131: hadolint and kube-score install steps without checksum verification
- `docker/control-plane/Dockerfile` lines 48-53: single `bun install` for all dependencies
- Reference pattern: OPA download in same Dockerfile (lines 14-27) uses `sha256sum -c`
- D046 decision: per-architecture ARG checksums with verification

## Expected Output

- CI workflow has `HADOLINT_SHA256` and `KUBESCORE_SHA256` variables with real checksums
- Both download steps include `sha256sum -c` verification before `chmod`/`tar`
- Dockerfile has `bun install --production --frozen-lockfile` followed by source COPY followed by `bun install --frozen-lockfile`
