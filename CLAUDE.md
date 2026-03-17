# CLAUDE.md: Interdict AI Operating Contract

Purpose: enforce consistent, high-assurance behavior across Claude Code, GSD (pi), and Codex.

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

- Core architecture invariants: `.gsd/rules/architecture-invariants.md`
- Agent execution workflow: `.gsd/rules/agent-workflow.md`
- Security and evidence rules: `.gsd/rules/security-evidence.md`

Use these rules before implementing code, tests, infra, or docs changes.

## Resource Paths

### Single Canonical Directory: `.gsd/`

All shared project intelligence lives in `.gsd/`. Other tool directories (`.claude/`, `.pi/`)
are Windows junction points that transparently serve the same files — edit only in `.gsd/`.

| Path | Purpose |
|------|---------|
| `.gsd/agents/` | Subagent profiles (canonical) |
| `.gsd/skills/` | Project skills (canonical) |
| `.gsd/rules/` | Architecture/workflow/security rules (canonical) |
| `.gsd/hooks/` | Pre-commit and CI hooks (canonical) |
| `.gsd/mcp/` | MCP server templates (canonical) |
| `.gsd/PROJECT.md` | Living project document |
| `.gsd/STATE.md` | Milestone/slice progress |
| `.gsd/DECISIONS.md` | Append-only decision register (77 decisions, D001–D077) |
| `.gsd/settings.json` | GSD settings |

After a fresh clone run: `bash scripts/setup-junctions.sh`

## Agent-First Workflow

For non-trivial work, default sequence:

1. `rust-engineer` drafts implementation and tests.
2. `security-auditor` reviews attack surface and invariant regressions.
3. `k8s-specialist` validates deployability (sidecar, network policy, manifests/Helm where applicable).
4. `multi-agent-coordinator` synthesizes findings and final acceptance criteria.

Additional specialized agents: `docker-expert`, `nextjs-developer`, `refactoring-specialist`, `test-automator`.

Local subagent profiles live in `.gsd/agents/` (canonical, served to both GSD and Claude Code via junctions).

## Skills Catalog

Project skills (invoke with `/skill:name`):

- `/skill:wasm-policy-compile` — Compile and validate policy artifacts
- `/skill:evidence-bundle-audit` — Audit evidence hash chaining and signatures
- `/skill:k8s-sidecar-provision` — Kubernetes sidecar deployment validation
- `/skill:regulatory-map-generator` — Map regulations to enforcement capabilities
- `/skill:rust-skills` — 179-rule Rust best practices guide
- `/skill:scan` — Full codebase scan for violations, security gaps, and architecture breaks
- `/skill:emil-anim` — Tasteful, purposeful web animations (Emil Kowalski / animations.dev philosophy)

## MCP Usage

- MCP server templates: `.gsd/mcp/servers.example.json`
- Setup and hardening guidance: `.gsd/mcp/README.md`

Recommended baseline servers: Git, Docker, Kubernetes, Wasmtime helper, crypto helper.

## Verification Gates (Required)

Before merge or milestone handoff:

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test -p kernel --test content_inspection_test`
- `cargo audit` (when installed)
- `npm run lint:infra` (hadolint, shellcheck, helm lint, buf lint)

If touched paths include policy enforcement or evidence logic, run additional targeted checks from relevant skill files.

## CI/CD Baseline

- CI workflow: `.github/workflows/ci-quality-security.yml` (10 jobs)
- Release pipeline: `.github/workflows/release.yml` (multi-platform builds, SBOM, cosign signing)
- Release automation: `.github/workflows/release-please.yml`
- Dependency automation: `renovate.json`
- Local hooks: `.husky/` (canonical) — commitlint, lint-staged, infra-check

Do not bypass failing hooks/checks; fix root causes.

## Known GSD Patches

After upgrading `gsd-pi`, re-apply local patches that fix upstream bugs not yet released:

- **clearPathCache loop fix** ([gsd-build/gsd-2#433](https://github.com/gsd-build/gsd-2/issues/433)): Run `bash scripts/gsd-patch-clearPathCache.sh` — fixes infinite dispatch loop caused by stale directory cache in auto.ts. Safe to run multiple times; skips if already patched. See D026 in DECISIONS.md.
- **guided-flow self-heal stale runtime records** ([gsd-build/gsd-2#436](https://github.com/gsd-build/gsd-2/issues/436)): Applied by the same patch script above — adds `selfHealRuntimeRecords()` to guided-flow.ts so manual-mode wizard cleans up stale `.gsd/runtime/units/` records from crashed auto-mode sessions.

## Documentation and Traceability

For architectural/security-impacting changes, update:

- `.gsd/STATE.md` (milestone/slice progress)
- `.gsd/DECISIONS.md` (append new architectural decisions)
- `.gsd/PROJECT.md` (if project context changes)
- `.planning/ROADMAP.md` (historical phase record — read-only, append new phases only)

Keep `docs/education.md` updated with mistakes and corrective actions.

If `AGENTS.md` and `CLAUDE.md` diverge, update both in the same change.
