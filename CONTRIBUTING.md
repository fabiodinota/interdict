# Contributing to Interdict

## Prerequisites

- **Rust 1.80+** (required for `LazyLock` in pattern initialization)
- **Bun 1.x** (control-plane TypeScript)
- **Node.js 22+** and npm (dashboard)
- **Docker** and Docker Compose (container builds and integration tests)
- **OPA CLI** (optional, for local Rego policy testing)

## Setup

```bash
# Rust workspace
cargo build --workspace

# Control plane (TypeScript)
cd control-plane && bun install

# Dashboard (Next.js)
cd dashboard && npm ci
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
```

## PR Process

1. Branch from `master` using a descriptive name (e.g., `feat/streaming-relay`, `fix/regex-panic`).
2. Make focused, atomic commits with conventional prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.
3. Ensure all quality gates pass locally before pushing.
4. Open a PR against `master`. CI runs the full gate matrix across deployment modes (vpc-native, sidecar, air-gapped).
5. All CI checks must pass. Security audit (`cargo audit`, `cargo deny`, Trivy) failures block merge.

## Architecture Constraints

See `CLAUDE.md` for the full operating contract. Key invariants:

- Data-plane hot path is Rust-only.
- Fail-closed default for high-risk profiles.
- No LLMs in inline policy decisions.
- Evidence hashes computed before mutation.
- No plaintext secrets in logs.

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
