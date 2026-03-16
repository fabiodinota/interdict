# S05: Infrastructure & CI Hardening — UAT

**Milestone:** M009
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All deliverables are declarative config files (Docker Compose, Helm templates, CI workflow, Cargo.toml, Dockerfile). Correctness is proven by structural validation tools (`docker compose config`, `helm lint`, `helm template`, `cargo clippy`, grep). No runtime behavior to exercise.

## Preconditions

- Repository checked out with all S05 changes applied
- `cargo` toolchain installed (for clippy verification)
- `docker` CLI available (for compose config validation)
- `helm` CLI v4+ available (for lint and template validation)
- No `.env` file required — use `--no-interpolate` for compose config or `.env.test` if available

## Smoke Test

Run `cargo clippy --workspace --all-targets -- -D warnings` — should complete with zero warnings. This proves the most impactful change (unsafe_code=deny) works end-to-end with all existing per-crate allow exceptions.

## Test Cases

### 1. Workspace unsafe_code deny enforcement

1. Run `grep "unsafe_code" Cargo.toml`
2. **Expected:** Output contains `unsafe_code = "deny"`
3. Run `cargo clippy --workspace --all-targets -- -D warnings`
4. **Expected:** Clean exit (zero warnings, zero errors). All five `#[allow(unsafe_code)]` sites in kernel, evidence-collector, and interdict-verify are respected.

### 2. Stale cert comment corrected

1. Run `grep -c "10-year" docker/certs/generate-internal-ca.sh`
2. **Expected:** Output is `0` (no matches)
3. Run `grep "1-year" docker/certs/generate-internal-ca.sh`
4. **Expected:** Matches on line 35 (and possibly other existing 1-year references)

### 3. lint-staged Rust handler improved

1. Run `grep "cargo fmt" package.json`
2. **Expected:** Match contains `cargo fmt -- --check` with a fallback message when cargo is not found
3. Verify the handler includes `command -v cargo` guard and `echo "[lint-staged] cargo not found"` fallback

### 4. Docker Compose cert-init hardening

1. Run `docker compose config --no-interpolate` (or `docker compose --env-file .env.test config` if .env.test exists)
2. Locate the `cert-init` service block in the output
3. **Expected:** The following properties are present:
   - `read_only: true`
   - `user: 1000:1000` (or `"1000:1000"`)
   - `security_opt:` contains `no-new-privileges:true`
   - `tmpfs:` contains `/tmp`
   - `networks:` shows `default: null` only (NOT `data`)
   - `command:` contains `apk --root /tmp/apkroot --initdb add --no-cache openssl`
   - `command:` contains `PATH=/tmp/apkroot/usr/bin:` before invoking the script

### 5. Helm minio-init securityContext complete

1. Run `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password=test --set minio.auth.rootPassword=test`
2. Find the minio-init container in the Job output
3. **Expected:** securityContext block contains:
   - `runAsNonRoot: true`
   - `runAsUser: 1000`
   - `runAsGroup: 1000`
   - `allowPrivilegeEscalation: false`
   - `readOnlyRootFilesystem: true`
   - `capabilities:` with `drop: [ALL]`
   - `seccompProfile:` with `type: RuntimeDefault`

### 6. Helm sidecar-init securityContext complete

1. Run `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password=test --set minio.auth.rootPassword=test --set sidecar.exampleApp.enabled=true --set sidecar.trafficRedirect.enabled=true`
2. Find the `interdict-iptables` init container in the output
3. **Expected:** securityContext block contains:
   - `runAsUser: 0` (root required for iptables)
   - `capabilities:` with `drop: [ALL]` AND `add: [NET_ADMIN]`
   - `allowPrivilegeEscalation: false`
   - `seccompProfile:` with `type: RuntimeDefault`
   - Does NOT contain `readOnlyRootFilesystem` (iptables needs /run/xtables.lock)
   - Does NOT contain `runAsNonRoot` (conflicts with runAsUser: 0)

### 7. Helm lint passes

1. Run `helm lint helm/interdict`
2. **Expected:** `1 chart(s) linted, 0 chart(s) failed`. Warning about missing dependencies is acceptable (dependency charts not built locally).

### 8. CI hadolint SHA256 verification

1. Open `.github/workflows/ci-quality-security.yml`
2. Find the "Install hadolint" step
3. **Expected:**
   - `HADOLINT_SHA256` variable set to `56de6d5e5ec427e17b74fa48d51271c7fc0d61244bf5c90e828aab8362d55010`
   - Line `echo "${HADOLINT_SHA256}  hadolint" | sha256sum -c -` appears after the curl download

### 9. CI kube-score SHA256 verification

1. Open `.github/workflows/ci-quality-security.yml`
2. Find the "Install kube-score" step
3. **Expected:**
   - `KUBESCORE_SHA256` variable set to `2f4c3a43045ac4006fa1adcf970660828d2df09c4e9165bafe27d36479fa355a`
   - Line `echo "${KUBESCORE_SHA256}  kube-score.tar.gz" | sha256sum -c -` appears after curl and before tar

### 10. Control-plane Dockerfile two-phase bun install

1. Open `docker/control-plane/Dockerfile`
2. **Expected:** Two separate `bun install` commands:
   - First: `bun install --production --frozen-lockfile` (production deps, cached layer)
   - Between them: `COPY control-plane/ .` (source code)
   - Second: `bun install --frozen-lockfile` (adds devDeps for drizzle-kit)

## Edge Cases

### unsafe_code deny with new unsafe block

1. Temporarily add `unsafe { }` to any file in `crates/kernel/src/` WITHOUT an `#[allow(unsafe_code)]` attribute
2. Run `cargo clippy --workspace --all-targets -- -D warnings`
3. **Expected:** Clippy fails with an `unsafe_code` deny error — proves enforcement is active
4. Revert the temporary change

### cert-init volume writability despite read_only

1. In the `docker compose config` output, confirm cert-init has both `read_only: true` AND a `certs:/certs` volume mount
2. **Expected:** Both present — volumes are exempt from rootfs read-only, so cert generation writes to the volume successfully

### SHA256 mismatch simulation

1. In the CI workflow, temporarily change one character of `HADOLINT_SHA256`
2. Run the hadolint install step logic mentally or in a CI test
3. **Expected:** `sha256sum -c` would produce `WARNING: 1 computed checksum did NOT match` and the step would fail
4. Revert the change

## Failure Signals

- `cargo clippy --workspace --all-targets -- -D warnings` produces errors mentioning `unsafe_code` → an `#[allow(unsafe_code)]` attribute was accidentally removed
- `docker compose config` fails → YAML syntax error in docker-compose.yml
- `helm lint` reports chart failures → template syntax error in Helm files
- `grep "10-year" docker/certs/generate-internal-ca.sh` returns non-zero count → stale comment not fixed
- CI workflow YAML is not valid → missing or malformed sha256sum lines
- `grep -c "bun install" docker/control-plane/Dockerfile` returns 1 → Dockerfile layer split not applied

## Requirements Proved By This UAT

- FH-INFRA-01 — All 10 assessment findings verified: cert-init hardened (test 4), CI downloads verified (tests 8-9), minio-init complete (test 5), sidecar-init complete (test 6), unsafe_code deny (test 1), Dockerfile layers (test 10), stale comment (test 2), lint-staged (test 3)

## Not Proven By This UAT

- Runtime cert-init execution (actual `docker compose up` with cert generation) — would require running Docker containers
- Actual CI pipeline execution with SHA256 verification — would require pushing to GitHub and running the workflow
- Production Kubernetes admission controller acceptance of the hardened securityContexts

## Notes for Tester

- `helm template` on Windows with git worktrees requires `--dependency-update` flag due to a Helm v4 path resolution bug. This is a known issue, not a code defect.
- `docker compose config` without an `.env` file will fail on interpolation of required variables. Use `--no-interpolate` to validate YAML structure, or create a `.env.test` with placeholder values.
- All SHA256 checksums were sourced from official GitHub release assets — if upgrading tool versions, new checksums must be fetched from the corresponding release page.
