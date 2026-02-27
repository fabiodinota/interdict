# CLAUDE Runtime Profile (Interdict)

This file exists for tools that auto-load `.claude/CLAUDE.md`.
Source of truth is the repository root `CLAUDE.md`.

## Mandatory Invariants

1. Rust-only data plane hot path.
2. Strict control-plane/data-plane separation.
3. Deterministic inline policy decisions only (no LLM adjudication).
4. Fail-closed defaults for high-risk policy profiles.
5. Pre-mutation hashing with tamper-evident evidence chaining.
6. No plaintext secrets or prompts in logs.
7. Streaming-first request/response enforcement.
8. VPC-native, sidecar, and air-gapped compatibility.

## Runtime References

- Root contract: `CLAUDE.md`
- Mirror contract: `AGENTS.md`
- Rules: `.claude/rules/*.md`
- Skills: `.claude/skills/*/SKILL.md`
- Subagents: `.claude/agents/*.md`
- MCP templates: `.claude/mcp/servers.example.json`

## Verification Gates

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test -p kernel --test content_inspection_test`
- `cargo audit` (if installed)

## Education Log

Maintain `education.md` in project root with mistakes and corrective actions.
