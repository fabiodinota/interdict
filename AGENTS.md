# AGENTS.md: Interdict Agent Contract

This file is the cross-agent operating contract loaded by GSD (pi), Claude Code, Codex, and OpenCode.

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

### Single Canonical Directory: `.gsd/`

All shared project intelligence lives in `.gsd/`. Other tool directories are Windows junction
points that transparently serve the same files — edit only in `.gsd/`.

| Path | Purpose |
|------|---------|
| `.gsd/agents/` | Subagent profiles (canonical) |
| `.gsd/skills/` | Project skills (canonical) |
| `.gsd/rules/` | Architecture/workflow/security rules (canonical) |
| `.gsd/hooks/` | Pre-commit and CI hooks (canonical) |
| `.gsd/mcp/` | MCP server templates (canonical) |
| `.gsd/PROJECT.md` | Living project document |
| `.gsd/STATE.md` | Milestone/slice progress |
| `.gsd/DECISIONS.md` | Append-only decision register |
| `.gsd/settings.json` | GSD settings |

### Junctions (read-only aliases — never edit here)

| Junction | Points to |
|----------|----------|
| `.pi/agents/` | `.gsd/agents/` |
| `.claude/agents/` | `.gsd/agents/` |
| `.claude/skills/` | `.gsd/skills/` |
| `.claude/rules/` | `.gsd/rules/` |
| `.claude/hooks/` | `.gsd/hooks/` |
| `.claude/mcp/` | `.gsd/mcp/` |

After a fresh clone run: `bash scripts/setup-junctions.sh`

## Default Execution Pattern

1. `rust-engineer` implements with tests.
2. `security-auditor` reviews security/compliance impact.
3. `k8s-specialist` validates deployability where infra is touched.
4. `multi-agent-coordinator` produces final synthesis and readiness call.

## Skills Catalog

Project skills (invoke with `/skill:name`):

- `/skill:wasm-policy-compile` — Compile and validate policy artifacts
- `/skill:evidence-bundle-audit` — Audit evidence hash chaining and signatures
- `/skill:k8s-sidecar-provision` — Kubernetes sidecar deployment validation
- `/skill:regulatory-map-generator` — Map regulations to enforcement capabilities
- `/skill:rust-skills` — 179-rule Rust best practices guide
- `/skill:scan` — Full codebase scan for violations, security gaps, and architecture breaks
- `/skill:emil-anim` — Tasteful, purposeful web animations (Emil Kowalski / animations.dev philosophy)

## Verification Gates

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test -p kernel --test content_inspection_test`
- `cargo audit` (when installed)

## CI and Dependency Baseline

- CI workflow: `.github/workflows/ci-quality-security.yml`
- Dependency automation: `renovate.json`
- Local hooks: `.husky/` (canonical), `.claude/hooks/` (helper mirrors)

If `AGENTS.md` and `CLAUDE.md` diverge, update both in the same change.
