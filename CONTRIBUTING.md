# Contributing to Interdict

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Rust (stable) | 1.85+ | Kernel and evidence-collector (edition 2024) |
| Bun | 1.1+ | Control-plane TypeScript |
| Node.js | 22+ | Dashboard (Next.js) |
| Docker + Compose | 24+ | Container builds and integration tests |
| OPA CLI | (optional) | Local Rego policy testing |

## Setup

```bash
# Clone and set up junctions (Windows — links .claude/ and .pi/ to .gsd/)
bash scripts/setup-junctions.sh

# Rust workspace
cargo build --workspace

# Control plane (TypeScript)
cd control-plane && bun install

# Dashboard (Next.js)
cd dashboard && npm ci

# Root tooling (husky hooks, commitlint, lint-staged)
npm ci
```

## Quality Gates

All of these must pass before merging:

```bash
# Rust
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
cargo test -p kernel --test content_inspection_test
cargo deny check

# TypeScript (control-plane)
cd control-plane
npx @biomejs/biome check ./src
bunx tsc --noEmit
bun test

# Dashboard
cd dashboard
npx prettier --check 'src/**/*.{ts,tsx,js,jsx,json,css}'
npx eslint
npm test
npm run build

# Infrastructure (from repo root)
npm run lint:infra       # hadolint, shellcheck, helm lint, buf lint
```

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) with these prefixes:

- `feat:` — new feature or capability
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `docs:` — documentation only
- `chore:` — tooling, deps, CI, config changes
- `test:` — test additions or fixes
- `style:` — formatting (auto-enforced by lint-staged hooks)

Scopes: `kernel`, `evidence-collector`, `control-plane`, `dashboard`, `ci`, `helm`, `infra`

Examples: `fix(kernel): handle empty body in streaming relay`, `feat(dashboard): add SLA timer to review queue`

Commitlint enforces this via husky pre-commit hooks.

## PR Process

1. Branch from `master` using a descriptive name (e.g., `feat/streaming-relay`, `fix/regex-panic`).
2. Make focused, atomic commits following the conventions above.
3. Ensure all quality gates pass locally before pushing.
4. Open a PR against `master`. CI runs the full gate matrix (10 jobs across Rust, TypeScript, infra).
5. All CI checks must pass. Security audit (`cargo audit`, `cargo deny`, Trivy) failures block merge.

## Architecture Constraints

See `AGENTS.md` for the full cross-agent operating contract. Key invariants:

- Data-plane hot path is Rust-only.
- Fail-closed default for high-risk profiles.
- No LLMs in inline policy decisions.
- Evidence hashes computed before mutation.
- No plaintext secrets in logs.
- Streaming-first — no full-buffer request/response in hot path.

## Repository Structure

```
crates/                    Rust workspace (3 crates)
  kernel/                  Data-plane proxy
  evidence-collector/      Evidence pipeline (gRPC + ClickHouse + S3)
  interdict-verify/        Offline evidence chain verification
control-plane/             Bun/Elysia API server
dashboard/                 Next.js dashboard
docker/                    Dockerfiles and entrypoint scripts
helm/interdict/            Kubernetes Helm chart
proto/                     Protobuf definitions (gRPC)
monitoring/                Prometheus + Grafana config
scripts/                   Deployment, testing, quality scripts
tests/integration/         Cross-service integration tests
docs/                      Operator guides, API refs, assessments
```

## Windows Development

### ring / aws-lc-sys Build Issues

On Windows with MSVC toolchain, native C dependencies (`ring`, `aws-lc-sys`, `zstd-sys`, `tikv-jemalloc-sys`) require the MSVC environment to be properly configured.

**Option A: Use Visual Studio Developer Command Prompt**

Open "Developer Command Prompt for VS" or "Developer PowerShell for VS" instead of a plain terminal. This sets `INCLUDE`, `LIB`, and `VCINSTALLDIR` automatically.

**Option B: Source vcvars in Git Bash / MSYS2**

Add to your `~/.bashrc`:

```bash
eval "$(cmd //c 'C:\Program Files\Microsoft Visual Studio\<VERSION>\Community\VC\Auxiliary\Build\vcvars64.bat >nul 2>&1 && set' 2>/dev/null | grep -E '^(INCLUDE|LIB|LIBPATH|VCINSTALLDIR|VCToolsInstallDir|WindowsSdkDir|UCRTVersion|WindowsSDKVersion)=' | sed 's/\\/\\\\/g; s/^/export /')"
```

Replace `<VERSION>` with your VS version (e.g., `18`, `2022`).

**Option C: Use WSL**

Run the full build inside WSL (Ubuntu), which avoids MSVC entirely:

```bash
wsl
cd /mnt/c/Users/youruser/interdict
cargo build --workspace
```

**Required VS Components:** If using MSVC, ensure "Desktop development with C++" workload is installed via the Visual Studio Installer, including the Windows SDK and MSVC build tools.

## Integration Tests

Cross-service integration tests live in `tests/integration/` and run against a Docker Compose test profile:

```bash
bash scripts/integration-test.sh
```

This spins up ephemeral containers with test-specific credentials and remapped ports (1xxxx range) to avoid conflicts with a running dev instance.
