# AI Enablement Blueprint

This document operationalizes `.planning/ai-improvement.md` for Interdict.

## Implemented in Repository

- Root contracts: `CLAUDE.md` and `AGENTS.md`
- Rule packs: `.claude/rules/*.md`
- Local subagent profiles: `.claude/agents/*.md`
- Skill catalog: `.claude/skills/*/SKILL.md`
- MCP templates and setup guidance: `.claude/mcp/`
- CI workflow baseline: `.github/workflows/ci-quality-security.yml`
- Dependency automation: `renovate.json`
- Updated local hooks for current repo layout: `.claude/hooks/*.sh`

## Manual Setup (one-time, local machine)

1. Install marketplace/skill tooling in your preferred runtime.
2. Install external subagent packs (for example VoltAgent collections).
3. Copy MCP template and configure local credentials:
   - `cp .claude/mcp/servers.example.json .claude/mcp/servers.local.json`
4. Register local MCP config in Claude/OpenCode/Codex runtime.

## Daily Workflow

1. Start work with required rules + relevant skill.
2. Route implementation to `rust-engineer`.
3. Route security review to `security-auditor`.
4. Route infra/deployability checks to `k8s-specialist` when applicable.
5. Merge findings with `multi-agent-coordinator`.

## Enforcement Gates

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test -p kernel --test content_inspection_test`
- `cargo audit` (if installed)
