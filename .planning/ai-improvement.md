**Key Points**  
- Your ContainerClaw setup already follows GSD best practices closely (`.planning/`, phased `PLAN.md` files, `STATE.md` with YAML frontmatter, atomic commits), providing a strong foundation. Research suggests layering in underused Claude Code/OpenCode/Codex features—subagents, skills via skills.sh, MCP servers, and rules files—will raise code quality, reduce context rot, and automate testing/security reviews without overhauling your workflow.  
- Evidence leans toward GitHub Actions pipelines that incorporate AI-assisted linting, multi-service Docker testing (self-hosted/cloud/hybrid modes), and security scans; these align with your production-grade reliability goals for multi-tenant isolation.  
- It seems likely that adding a root `CLAUDE.md`/`AGENTS.md`, project-specific skills, and targeted subagents (e.g., `docker-expert`, `security-auditor`) will enforce consistent practices across Python orchestrator, Go proxy, Next.js dashboard, and ephemeral containers.  
- Updating dependencies (e.g., PocketBase to 0.36.5+, Next.js to 16.x series, FastAPI to 0.133.1, ARQ to 0.27+) via automated tools like Renovate appears to maintain security and performance while supporting your three deployment modes.  

**Enhanced AI Tool Integration**  
Start by placing a comprehensive `CLAUDE.md` (or `AGENTS.md` for OpenCode/Codex) in the project root to codify ContainerClaw rules: tenant isolation via directory-level vaults, Ed25519 JWT signing, JIT credentials, Squid egress allowlists, and phase-specific conventions (e.g., “Steered tasks must set `auto_approve=False`”). This file is read on every session, reducing prompt drift.  

Install skills from skills.sh (Vercel’s marketplace CLI) and create custom ones for recurring tasks like `/provision-client` (vault setup + PocketBase rules) or `/vault-checkpoint` (git reset + clean). These load on-demand and work across Claude Code, OpenCode, and Codex.  

Activate subagents from the VoltAgent collection via the marketplace or manual copy to `~/.claude/agents/` (or OpenCode equivalents). Prioritize `docker-expert` for Compose overlays, `security-auditor` for multi-tenant gaps, `test-automator` for pytest/Jest generation, and `multi-agent-coordinator` to orchestrate GSD phases. Example invocation in a GSD execute step: “Have the security-auditor review the Go license proxy for CVE-2025-4517 bypasses.”  

**Project Structure Improvements**  
Keep your Docker-first layout but enhance for AI discoverability:  
- Root: Add `.claude/` (or `.opencode/`) with `skills/`, `agents/`, `hooks/`; `CLAUDE.md`; `renovate.json`.  
- Services: `dashboard/` (Next.js), `orchestrator/` (Python), `license-proxy/` (Go), each with dedicated `tests/`, `.dockerignore`, and language-specific rules.  
- Planning remains `.planning/`—extend with MCP-driven context for Git/Docker/PocketBase.  
This supports monorepo-like sharing while preserving Compose simplicity for 5-10 tenants.  

**Automated Testing & CI/CD Pipelines**  
Use GSD’s `/gsd:verify-work` as the base, then wire GitHub Actions:  
- On PR/push: matrix builds for deployment modes; run linters (ruff, golangci-lint, ESLint), unit/integration tests (Docker Compose up + healthchecks), Trivy/Semgrep scans, and AI code review via OpenCode/Claude in CI.  
- Add pre-commit hooks powered by Claude hooks or TDD Guard to auto-format and test on edits.  
- For durability: ARQ job timeouts + vault rollback tests become automated via `test-automator` subagent.  

**Up-to-Date Tech & Versioning**  
Adopt Renovate or Dependabot with a `renovate.json` config targeting your stack. Current recommended stable versions (February 2026): PocketBase 0.36.5+, Next.js 16.x, FastAPI 0.133.1, ARQ 0.27+, LiteLLM 1.81+, Go 1.26, Python 3.13 (with uv). These maintain compatibility with your ephemeral containers, health probes, and license heartbeat.  

---

ContainerClaw represents a sophisticated brownfield project that already leverages the Get Shit Done (GSD) framework to an impressive degree, as evidenced by the precise alignment of your `PROJECT.md`, `STATE.md`, phased plans (01-01 through 07-06), and artifacts like `REQUIREMENTS.md` and `.planning/research/`. This structured, spec-driven approach—complete with atomic Git commits, wave-based execution, verification layers, and YAML-frontmatter state tracking—eliminates much of the “vibecoding” common in AI-assisted development and directly supports your core value of reliable, leak-proof multi-tenant execution.  

The opportunity for optimization lies in the features you noted are underutilized: skills, subagents, MCPs (Model Context Protocol), and rules. By weaving these into your existing GSD + OpenCode/Codex/Claude Code stack, you can achieve higher code quality, fully automated testing/CI/CD, tighter project structure, and continuous dependency freshness while preserving the lightweight Docker Compose foundation that serves agencies with 5-10 clients. Below is a comprehensive, production-oriented blueprint drawn from deep analysis of the official documentation, repositories, and community resources as of February 2026.  

### Deep Dive into Your Current Toolchain and Extension Points  
**GSD (get-shit-done)** functions as the meta-orchestrator. Its six-step cycle (new-project → discuss → plan → execute → verify → milestone) already powers your Phase 5 Deployment Packaging and ongoing Phase 6/7 work. Recent enhancements like YAML `STATE.md` frontmatter (v1.21.0, Feb 2025) and context-window monitoring hooks make it ideal for brownfield gaps such as fragile orchestrator edge cases or incomplete dashboard workflows. Extend it by injecting subagents into the execute and verify waves for parallel research/planning on topics like ARQ durability or RBAC middleware chains.  

**Claude Code** (Anthropic) provides the agentic engine: codebase-wide understanding, subagent spawning, skills as slash-commands, hooks for pre/post-action scripts, and native MCP support. Its portability across CLI, VS Code, desktop, and web surfaces lets you hand off steering tasks from terminal to mobile.  

**OpenCode** (open-source terminal/TUI agent) serves as your flexible runtime—provider-agnostic (Claude, GPT, Gemini, local), LSP-enabled, and configurable via `opencode.json` for custom agents. It supports Claude-compatible skills and subagents with minimal migration (place Markdown definitions in `~/.config/opencode/agent/`).  

**Codex** (OpenAI) mirrors the above with `AGENTS.md`, Skills, MCP, and multi-agent parallelism, making it seamless to route specific tasks (e.g., Next.js UI) through GPT-5.3-Codex while keeping GSD as the coordinator.  

**Skills.sh** acts as the marketplace and CLI for reusable instruction packages. Skills are simple folders containing `SKILL.md` (YAML frontmatter + markdown instructions) that load automatically when triggers match. Install with `npx skills add <repo>`; create custom ones for ContainerClaw patterns (e.g., ephemeral credential generation). They translate directly across Claude, OpenCode, and Codex.  

**Subagents** from VoltAgent/awesome-claude-code-subagents (11.5k stars, updated Feb 21 2026) provide 100+ specialized workers. Relevant categories and examples:  

| Category | Recommended Subagent | ContainerClaw Use Case |
|----------|----------------------|------------------------|
| Infrastructure | docker-expert, deployment-engineer | Ephemeral containers, Compose dynamic includes (self/cloud/hybrid), Squid allowlist resets |
| Quality & Security | security-auditor, penetration-tester, compliance-auditor, test-automator | JWT Ed25519 signing, tenant vault isolation, CVE-2025-4517 regex enforcement, ARQ retry logic testing |
| Language Specialists | golang-pro, python-pro, nextjs-developer | License proxy middleware chain, orchestrator health probes, dashboard realtime SSE + approval history |
| Meta & Orchestration | multi-agent-coordinator, workflow-orchestrator | GSD phase orchestration, steering history JSON accumulation, parallel stats fetch in client onboarding |
| Dev Experience | refactoring-specialist, dependency-manager, git-workflow-manager | Brownfield gap closure (e.g., pb_setup.py), atomic commits, Renovate config |

Install via `claude plugin install voltagent-infra` or manual copy; chain with `multi-agent-coordinator` for end-to-end flows (e.g., “python-pro writes ARQ job, docker-expert containers it, security-auditor reviews”).  

**Model Context Protocol (MCP)** is the open standard (modelcontextprotocol.io, released by Anthropic) that lets agents discover and call external tools without bloating context windows. Instead of dumping entire Git histories or Docker states into prompts, MCP servers expose code APIs that agents can execute in sandboxes (98.7% token reduction in benchmarks). The registry (registry.modelcontextprotocol.io) lists ready servers; create custom ones for:  
- Docker SDK (build/test modes, health probes)  
- PocketBase admin (collection rules, audit_logs)  
- Git (commit/PR with GSD semantics)  
- License validation heartbeat  

Place MCP servers in `./servers/`; agents discover them via filesystem and interact via code execution. This is perfect for your JIT credentials and vault checkpoint best-effort logic—offload to code rather than describe in every prompt.  

### Recommended Project Structure Enhancements  
Build on your existing layout for AI discoverability and scalability:  

```
.
├── .claude/ (or .opencode/)          # Skills, agents, hooks, CLAUDE.md
├── .github/workflows/                # CI/CD matrix for modes
├── .planning/                        # Your GSD artifacts (keep)
├── dashboard/                        # Next.js + PocketBase client
├── orchestrator/                     # Python/FastAPI + ARQ
├── license-proxy/                    # Go binary + heartbeat
├── infrastructure/                   # Dockerfiles, Compose overlays
├── tests/                            # Cross-service integration
├── skills/                           # Custom skills.sh packages
├── renovate.json                     # Automated updates
├── CLAUDE.md / AGENTS.md             # Rules + ubiquitous language
└── claw.sh                           # Wrapper (already present)
```

This polyglot monorepo pattern (no heavy Turborepo required for Docker-centric v1) enables per-service skills/rules while keeping Compose as the single-command deploy vehicle (`docker compose up -d` via `setup_compose_file()`).  

### Automated Testing & CI/CD Pipeline Blueprint  
Transform Phase 3 observability and Phase 5 packaging into fully automated loops:  

1. **Local Pre-Commit Hooks** — Use Claude/OpenCode hooks (TDD Guard, TypeScript Quality Hooks) + pre-commit framework to run linters, formatters, and quick tests on every save/commit.  
2. **GitHub Actions Matrix** —  
   - Jobs: lint (ruff + golangci-lint + ESLint), unit (pytest/Jest/go test), integration (docker-compose up per mode + health endpoint 503 checks), security (Trivy images, Semgrep, AI audit via subagent).  
   - On PR: require `/gsd:verify-work` success + subagent approval.  
   - Artifacts: built images for self/cloud/hybrid, license proxy binary checksum verification.  
3. **GSD Integration** — Extend `/gsd:verify-work` to spawn `test-automator` and `qa-expert` subagents; auto-generate fix plans on failure.  
4. **Release** — `/gsd:complete-milestone` triggers semantic versioning, changelog, and Docker Hub push with ZeroClaw SHA-256 baseline.  

This pipeline directly addresses your Active requirements (end-to-end reliability, healthchecks, error handling) and Out-of-Scope boundaries (no K8s for v1).  

### Versioning & Dependency Hygiene  
Implement Renovate (or Dependabot) with a config that groups updates by service and creates PRs with AI-generated descriptions (via `dependency-manager` subagent). Target stable releases as of February 27 2026:  

| Component | Recommended Version | Rationale |
|-----------|---------------------|-----------|
| PocketBase | 0.36.5+ | Enhanced collection rules, realtime SSE with expand preservation |
| Next.js | 16.x series | App Router Suspense improvements, better route groups for auth |
| FastAPI | 0.133.1 | Improved async, structlog integration |
| ARQ | 0.27+ | Better Redis Streams handling, dead-letter queues |
| LiteLLM | 1.81+ | Cloud mode virtual key routing, budget caps |
| Go | 1.26 | Ed25519 performance, atomic.Value enhancements |
| Python | 3.13 (uv) | Faster installs, minimal agent image surface |

Add `uv` for Python dependency locking and `curl + sha256sum` checks (already in your Phase 5) to all Docker builds.  

### Step-by-Step Implementation Roadmap (Next 2 Weeks)  
1. **Day 1-2**: Create `CLAUDE.md` + `AGENTS.md` (copy templates from awesome-claude-code). Install VoltAgent subagents and skills.sh CLI.  
2. **Day 3-5**: Build 3-5 custom skills (provisioning, vault ops, security review) and one MCP server for Docker/PocketBase. Test in GSD quick mode.  
3. **Day 6-8**: Add GitHub Actions workflow; run against current Phase 7 client onboarding. Use `devops-engineer` subagent to generate.  
4. **Day 9-10**: Update dependencies via Renovate PRs; have `refactoring-specialist` review migration impact on ephemeral containers and license proxy.  
5. **Day 11+**: Integrate into daily GSD flow—e.g., every execute-phase starts with relevant subagents + MCP context. Run full UAT on deployment modes.  

These changes directly reinforce your Key Decisions (ephemeral containers, stateless JWTs, ARQ, decryption-based licensing) while closing gaps in authentication, human-in-the-loop steering, and audit logging. The result is higher-quality AI-generated code, fewer terminal escapes, and a commercial-grade platform ready for self-hosted, cloud, and hybrid customers.  

Your existing GSD discipline already puts you ahead of most AI-assisted projects; these targeted enhancements turn good practices into automated, repeatable excellence.  

**Key Citations**  
- Claude Code Overview Documentation: https://code.claude.com/docs/en/overview  
- GSD Repository (get-shit-done): https://github.com/gsd-build/get-shit-done  
- Awesome Claude Code Subagents Collection: https://github.com/VoltAgent/awesome-claude-code-subagents  
- Awesome Claude Code Curated Resources: https://github.com/hesreallyhim/awesome-claude-code  
- Model Context Protocol Registry & Specification: https://registry.modelcontextprotocol.io/ and https://modelcontextprotocol.io/  
- OpenCode AI Documentation & Agents: https://opencode.ai/docs and https://opencode.ai/docs/agents/  
- Skills.sh Agent Skills Directory: https://skills.sh/  
- OpenAI Codex Developer Resources: https://developers.openai.com/codex