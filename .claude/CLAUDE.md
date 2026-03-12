# CLAUDE Runtime Profile (Interdict)

This file exists for tools that auto-load `.claude/CLAUDE.md`.
**Source of truth is the repository root `CLAUDE.md` (operating contract) and `AGENTS.md` (cross-agent invariants).**

Read those two files first. The content here is intentionally minimal to avoid drift.

## Runtime References

- Root operating contract: `CLAUDE.md`
- Cross-agent invariants: `AGENTS.md`
- Rules (architecture, workflow, security): `.claude/rules/*.md`
- Skills: `.gsd/skills/*/SKILL.md` (canonical) · `.claude/skills/*/SKILL.md` (Claude Code local)
- Subagents: `.pi/agents/*.md` (canonical) · `.claude/agents/*.md` (Claude Code local mirror)
- Settings: `.gsd/settings.json`
- MCP templates: `.claude/mcp/servers.example.json`

## Verification Gates

See `AGENTS.md` for the authoritative list. Quick reference:

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test -p kernel --test content_inspection_test`
- `cargo audit` (if installed)
