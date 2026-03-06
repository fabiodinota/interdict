# Hook Scripts

This directory contains repository hook scripts used by pre-commit and optional Claude Code/OpenCode hook integrations.

## Files

- `pre-commit-checks.sh`: Fast staged-file checks scoped by changed paths
- `pre-push-checks.sh`: Full workspace validation before pushes (format, clippy, tests, build)

## Install

1. Install pre-commit:

```bash
pip install pre-commit
```

2. Install git hooks:

```bash
pre-commit install --hook-type pre-commit --hook-type pre-push
```

3. Run all hooks once:

```bash
pre-commit run --all-files
```

## Covered Checks

| Hook | Scope | Checks |
|------|-------|--------|
| pre-commit | Changed Rust files | `cargo fmt --check`, `cargo clippy -D warnings` |
| pre-commit | Changed control-plane files | `bun run typecheck` |
| pre-commit | Changed dashboard files | `bun run lint` |
| pre-push | All | Full cargo test, control-plane tests, dashboard build |

## Notes

- Pre-commit hooks are scoped by changed paths to keep commit feedback fast.
- Pre-push hooks run the full verification gates from CLAUDE.md.
- CI remains the source of truth for full matrix and security checks.
