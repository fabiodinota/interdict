# CLAUDE.md: Interdict AI Operating Contract

Purpose: enforce consistent, high-assurance behavior across Claude Code, OpenCode, and Codex.

## Non-Negotiable Invariants

1. Data plane hot path is Rust-only; do not move request/response enforcement into Python or TypeScript.
2. Keep strict control-plane vs data-plane separation; control plane distributes policy, data plane enforces.
3. Do not use LLMs to make inline policy decisions; deterministic policy logic only (Rego/Wasm/heuristics).
4. Default enforcement posture is fail-closed for high-risk/banking profiles.
5. Always compute evidence hashes before mutation/redaction and preserve tamper-evident chains.
6. Never log plaintext secrets, raw prompts, API keys, or private material.
7. Maintain streaming-first behavior; avoid full-buffer request/response handling in the hot path.
8. Deployment artifacts must remain compatible with VPC-native, sidecar, and air-gapped operation.

## Project Rules Index

- Core architecture invariants: `.claude/rules/architecture-invariants.md`
- Agent execution workflow: `.claude/rules/agent-workflow.md`
- Security and evidence rules: `.claude/rules/security-evidence.md`

Use these rules before implementing code, tests, infra, or docs changes.

## Agent-First Workflow

For non-trivial work, default sequence:

1. `rust-engineer` drafts implementation and tests.
2. `security-auditor` reviews attack surface and invariant regressions.
3. `k8s-specialist` validates deployability (sidecar, network policy, manifests/Helm where applicable).
4. `multi-agent-coordinator` synthesizes findings and final acceptance criteria.

Local Interdict subagent profiles live in `.claude/agents/`.

## Skills Catalog

Project skills live in `.claude/skills/` and are invoked as slash commands:

- `/wasm-policy-compile`
- `/evidence-bundle-audit`
- `/k8s-sidecar-provision`
- `/regulatory-map-generator`

Each skill includes inputs, execution steps, verification, and expected artifacts.

## MCP Usage

- MCP server templates: `.claude/mcp/servers.example.json`
- Setup and hardening guidance: `.claude/mcp/README.md`

Recommended baseline servers: Git, Docker, Kubernetes, Wasmtime helper, crypto helper.

## Verification Gates (Required)

Before merge or milestone handoff:

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test -p kernel --test content_inspection_test`
- `cargo audit` (when installed)

If touched paths include policy enforcement or evidence logic, run additional targeted checks from relevant skill files.

## CI/CD Baseline

- Workflow file: `.github/workflows/ci-quality-security.yml`
- Dependency automation: `renovate.json`
- Local hooks: `.claude/hooks/*.sh`

Do not bypass failing hooks/checks; fix root causes.

## Documentation and Traceability

For architectural/security-impacting changes, update:

- `.planning/STATE.md` (position and decisions)
- `.planning/ROADMAP.md` (if plan status changes)
- `.planning/REQUIREMENTS.md` (if requirement completion changes)

Keep `education.md` updated with mistakes and corrective actions.
