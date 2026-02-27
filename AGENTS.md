# AGENTS.md: Interdict Agent Contract (Mirror)

This file mirrors `CLAUDE.md` so Codex/OpenCode/Claude share one operating contract.

## Non-Negotiable Invariants

1. Data plane hot path is Rust-only.
2. Control plane and data plane remain strictly separated.
3. No LLM-based inline policy decisions.
4. Fail-closed by default for high-risk profiles.
5. Evidence hashes are computed before redaction/mutation and chained tamper-evidently.
6. No plaintext secret/prompt/API-key logging.
7. Streaming-first enforcement in hot path.
8. Support VPC-native, sidecar, and air-gapped deployment models.

## Required References

- Source of truth: `CLAUDE.md`
- Rules: `.claude/rules/architecture-invariants.md`, `.claude/rules/agent-workflow.md`, `.claude/rules/security-evidence.md`
- Skills: `.claude/skills/*/SKILL.md`
- Subagents: `.claude/agents/*.md`
- MCP templates: `.claude/mcp/servers.example.json`

## Default Execution Pattern

1. `rust-engineer` implements with tests.
2. `security-auditor` reviews security/compliance impact.
3. `k8s-specialist` validates deployability where infra is touched.
4. `multi-agent-coordinator` produces final synthesis and readiness call.

## Verification Gates

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test -p kernel --test content_inspection_test`
- `cargo audit` (when installed)

## CI and Dependency Baseline

- CI workflow: `.github/workflows/ci-quality-security.yml`
- Dependency automation: `renovate.json`

If `AGENTS.md` and `CLAUDE.md` diverge, update both in the same change.
