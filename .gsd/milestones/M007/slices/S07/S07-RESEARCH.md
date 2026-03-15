# S07: DevOps & Deployment Maturity — Research

**Date:** 2026-03-15

## Summary

S07 targets five concrete deliverables: (1) multi-platform Docker images (amd64+arm64), (2) hardened `.dockerignore` files, (3) Helm chart passing kube-score, (4) Docker Compose enhancements (logging rotation, optional monitoring profile, backup scripts), and (5) environment validation that prevents misconfiguration at startup. The existing infrastructure is already strong — multi-stage Dockerfiles with cargo-chef caching, non-root users, read-only rootfs, security contexts in Helm, and network policies already enabled by default (D036). The work is mostly additive (monitoring profile, backup scripts, kube-score CI, env validation) with surgical modifications to release.yml (multi-platform) and `.dockerignore` (trimming context).

The primary risk is multi-platform Docker builds for Rust services. The kernel and evidence-collector use `cargo-chef` on `debian:bookworm-slim` — QEMU emulation for arm64 Rust compilation is notoriously slow (10-30x slower). However, since release builds trigger only on tag push (not every PR), this is acceptable. The control-plane Dockerfile has a harder problem: it hardcodes `opa_linux_amd64_static` in the OPA download — this must use `TARGETARCH` to select the correct binary. The dashboard (Node.js-based) is trivially multi-platform.

## Recommendation

Execute in 5 tasks, ordered by dependency and risk:

1. **T01: .dockerignore hardening** — Add ~20 missing exclusions (docs/, helm/, scripts/, .github/, .husky/, *.md, config files) to root `.dockerignore`. This reduces Docker build context size meaningfully and unblocks cleaner multi-platform builds. Dashboard `.dockerignore` needs `public/` exclusion audit but is mostly adequate. Quick, safe, no regressions.

2. **T02: Multi-platform Docker builds** — Add `docker/setup-qemu-action@v3` to release.yml and `platforms: linux/amd64,linux/arm64` to all 4 `docker/build-push-action` steps. Fix control-plane Dockerfile to use `TARGETARCH` for OPA binary download. Rust services work via QEMU emulation (slow but correct for release-only builds). Dashboard works natively via multi-arch Node.js images.

3. **T03: Helm kube-score integration** — Install kube-score in the `infra-quality` CI job, run `helm template | kube-score score -` with known-issue annotations. Currently missing: no `startupProbe` on any deployment (kube-score wants it). Pod topology spread constraints may also flag. Add kube-score to `infra-check.sh` so it runs locally too.

4. **T04: Docker Compose enhancements** — Add JSON-file logging driver with rotation to all services. Create `docker-compose.monitoring.yml` override with Prometheus + Grafana as a `monitoring` profile (`docker compose --profile monitoring up`). Add Prometheus config scraping control-plane `/health` and kernel metrics. Add Grafana dashboard JSON. Create `scripts/backup.sh` for Postgres pg_dump + ClickHouse backup.

5. **T05: Environment validation** — Create `scripts/validate-env.sh` that checks required env vars, validates URL formats, verifies cert paths exist, and confirms password placeholders are replaced. Wire it into entrypoint scripts with a `--validate` pre-flight or as a Docker Compose healthcheck dependency. Add to `scripts/smoke-test.sh` as a pre-step.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Multi-arch Docker builds | `docker/setup-qemu-action@v3` + Buildx | Industry standard, already using Buildx |
| Helm chart scoring | `kube-score` | De-facto K8s manifest linter, catches real issues |
| Prometheus monitoring | Official `prom/prometheus` + `grafana/grafana` images | Battle-tested, zero custom code |
| Postgres backup | `pg_dump` / `pg_dumpall` | Built-in, reliable, well-documented |
| ClickHouse backup | `clickhouse-backup` or `clickhouse-client` queries | Official tooling |
| Log rotation | Docker JSON-file driver `max-size`/`max-file` | Built into Docker, zero dependencies |
| OPA multi-arch binary | OPA releases include `opa_linux_{amd64,arm64}_static` | Official binaries for both architectures |

## Existing Code and Patterns

- `docker/kernel/Dockerfile` — Multi-stage cargo-chef pattern. 4 stages: chef→planner→builder→runtime. Debian bookworm-slim runtime. Non-root user, healthcheck, entrypoint. Pattern to replicate for any changes.
- `docker/control-plane/Dockerfile` — OPA download isolated in `opa-fetch` stage (D018). Hardcodes `amd64` — needs `TARGETARCH` fix. `oven/bun:1.1-slim` base for build, same for production.
- `docker/dashboard/Dockerfile` — 3-stage: deps→builder→runner. Uses `node:20-slim` for production (Next.js standalone). Has separate `.dockerignore` in `dashboard/`.
- `docker/evidence-collector/Dockerfile` — Same cargo-chef pattern as kernel but without cmake dependency. Simpler runtime deps.
- `.dockerignore` — Excludes build artifacts, IDE files, secrets, runtime data. Missing: docs, helm, scripts, .github, .husky, markdown files, CI config files. ~500KB+ of unnecessary context sent per build.
- `docker-compose.yml` — Well-structured: infra (postgres, clickhouse, minio), cert-init, 4 Interdict services. Has `read_only: true`, `security_opt: no-new-privileges`, resource limits, healthchecks. No logging config, no profiles, no monitoring.
- `.github/workflows/release.yml` — S05 created. Builds 4 images, single-platform (linux/amd64 implied). Has Buildx already. No QEMU setup. S05 Forward Intelligence explicitly says to add `platforms: linux/amd64,linux/arm64` and QEMU.
- `.github/workflows/ci-quality-security.yml` — Has `infra-quality` job that runs `scripts/quality/infra-check.sh`. This job already installs Helm — perfect place to add kube-score.
- `scripts/quality/infra-check.sh` — Runs hadolint, shellcheck, buf lint, helm lint+template, yamllint. No kube-score. Adding kube-score here would give both CI and local coverage.
- `helm/interdict/values.yaml` — Network policies already `enabled: true` (D036). All services have security contexts, resource limits, readiness+liveness probes. Missing: startupProbe (kube-score will flag this).
- `helm/interdict/templates/*/deployment.yaml` — All 4 deployments follow identical pattern: pod securityContext (fsGroup, seccomp), container securityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL caps), init containers for dependency ordering.
- `helm/interdict/templates/*/networkpolicy.yaml` — All 4 network policies have correct ingress/egress rules scoped to specific pods+ports. Well-designed.
- `env.example` — Comprehensive, well-documented. Uses `CHANGE_ME` placeholders. Docker Compose uses `${VAR:?error message}` syntax to fail on missing required vars. Good pattern but no pre-flight validation script.
- `docker/kernel/entrypoint.sh` — Sets defaults with `: "${VAR:=default}"`, generates config via envsubst, auto-generates CA cert. No env validation.
- `docker/control-plane/entrypoint.sh` — Simple: migrate, seed, start. No env validation.
- `docker/evidence-collector/entrypoint.sh` — Minimal: just exec the binary. No env validation.
- `scripts/smoke-test.sh` — E2E smoke test with docker-compose up, health wait, Playwright, teardown. Could benefit from env validation pre-step.

## Constraints

- **Rust cross-compilation via QEMU is slow** — arm64 builds under QEMU can take 30-60 minutes for Rust. Acceptable for release-only pipeline but not for PR builds.
- **OPA binary is architecture-specific** — Must use `TARGETARCH` automatic platform arg in control-plane Dockerfile to download correct OPA binary.
- **Docker Compose profiles require v2.20+** — The `profiles` key is supported in modern Docker Compose but older installations may not support it. Document minimum version.
- **kube-score may produce false positives** — Some checks (like image tag policy) may conflict with Helm patterns (using `appVersion`). May need `--ignore` flags for known acceptable patterns.
- **Monitoring stack must be optional** — Prometheus + Grafana should never start by default. Use Docker Compose `profiles:` key so they only start with `--profile monitoring`.
- **Backup scripts must handle Docker volumes** — Postgres and ClickHouse data live in named Docker volumes. Backup scripts need to exec into running containers or mount volumes to a backup container.
- **`.dockerignore` changes affect all 4 service builds** — Root `.dockerignore` is shared by kernel, control-plane, and evidence-collector (all use `context: .`). Dashboard uses its own `.dockerignore` via `dashboard/` context. Be careful not to exclude files that kernel/control-plane/evidence-collector actually need (proto/, Cargo.toml, crates/, control-plane/).
- **GHA `docker/build-push-action` cache key changes** — Adding `platforms:` may invalidate the existing GHA cache. First multi-platform build will be a full rebuild.

## Common Pitfalls

- **Excluding proto/ from .dockerignore** — The control-plane Dockerfile copies `proto/` for gRPC. Must NOT exclude `proto/` from root `.dockerignore`. Use allowlist pattern (`!proto/`) or be very specific about what to exclude.
- **QEMU + cargo-chef recipe invalidation** — cargo-chef `prepare` generates platform-specific recipes. The `planner` stage must run per-platform, which Buildx handles correctly, but the GHA cache key should include platform to avoid cross-contamination.
- **kube-score version pinning** — kube-score checks evolve. Pin the version in CI to avoid surprise failures on new kube-score releases.
- **Prometheus scrape targets in Docker network** — Prometheus must be on the same Docker network as the services it scrapes. Use the service names (e.g., `control-plane:3000`) not `localhost`.
- **Backup script permissions** — Scripts that exec into containers need Docker socket access. Document that backup scripts must run as a user with Docker group membership.
- **Environment validation false negatives** — Checking that env vars are "set" isn't enough. The `CHANGE_ME` placeholders will pass a simple `-z` check. Must also check for placeholder patterns.

## Open Risks

- **QEMU arm64 Rust build time** — Could exceed GitHub Actions timeout (6 hours for public, less for private). Mitigate by ensuring GHA cache works across platforms. If too slow, consider arm64 self-hosted runner or making arm64 builds optional.
- **kube-score strict mode may require startupProbe** — All 4 deployments lack startupProbe. kube-score v1.18+ flags this. Adding startupProbe requires understanding each service's startup behavior (kernel CA gen, control-plane migrations, etc.). The init containers currently handle ordering but startupProbe adds container-level startup checking.
- **Monitoring profile adds ~500MB to Docker pull** — Prometheus + Grafana images are significant. Document that the monitoring profile is for development/staging only, not production (where operators would have their own monitoring stack).
- **ClickHouse backup complexity** — ClickHouse backup tooling is less standardized than Postgres. May need to use `clickhouse-client` with `BACKUP` SQL command or `clickhouse-backup` tool depending on the ClickHouse version.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Docker / Docker Compose | `docker-expert` | installed (local) |
| Docker Compose orchestration | `manutej/luxor-claude-marketplace@docker-compose-orchestration` | available (454 installs) |
| Helm chart patterns | `nickcrew/claude-ctx-plugin@helm-chart-patterns` | available (78 installs) |
| Helm validation | `akin-ozer/cc-devops-skills@helm-validator` | available (25 installs) |
| K8s YAML validation | `akin-ozer/cc-devops-skills@k8s-yaml-validator` | available (27 installs) |
| Kubernetes/Helm | `k8s-sidecar-provision` | installed (project skill) |
| GitHub Actions workflows | `github-workflows` | installed (local) |

## Sources

- S05 Forward Intelligence explicitly states: "S07 should add `platforms: linux/amd64,linux/arm64` to each `docker/build-push-action` step and set up QEMU" (source: S05-SUMMARY.md)
- Docker Buildx supports `TARGETARCH` automatic platform arg for multi-platform builds (source: Docker documentation, established pattern)
- kube-score checks for startupProbe, securityContext, resource limits, and network policies (source: kube-score documentation)
- Docker Compose `profiles` key enables optional service groups (source: Docker Compose specification)
- Docker JSON-file logging driver supports `max-size` and `max-file` rotation options (source: Docker documentation)
- OPA publishes `opa_linux_{amd64,arm64}_static` binaries for both architectures (source: OPA GitHub releases)
