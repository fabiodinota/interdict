# CLAUDE.md: AI Assistant Guidelines for Interdict.io

**Project:** Interdict.io — AI Governance Kernel & Compliance Proxy  
**Version:** 1.1 (Updated with Education Log, PR/Commit Guidelines, and More)  
**Last Updated:** February 26, 2026  
**Purpose:** This file provides instructions for AI assistants (e.g., Claude, Grok, or similar models) working on Interdict.io. It defines coding standards, best practices, architecture reminders, linting rules, error handling, and workflows for learning from mistakes. AI assistants should read and adhere to this at the start of every session to ensure contributions align with the project's goals: sub-10ms latency, <128MB RAM, security-first (mTLS, crypto audits), and compliance focus (e.g., EU AI Act mappings). Reference the core docs (REQUIREMENTS.md, PROJECT.md, etc.) for context.

## Core Principles
- **Performance First:** All code must prioritize low latency (<10ms p99 overhead) and resource efficiency (<128MB RAM steady state). Avoid unbounded operations (e.g., no unbounded Tokio channels per PITFALLS.md).
- **Security & Compliance:** Use mTLS for internal comms (INFR-05), hash sensitive data (EVID-06), and fail-closed by default (PLCY-09). No plaintext logging of prompts/API keys.
- **Plane Separation:** Data Plane (Rust kernel) handles hot-path traffic only—no DB access or stateful logic. Control Plane (TS) manages config/UI.
- **Test-Driven:** Write tests first (e.g., for KERN-07 latency). Use benchmarks (criterion.rs for Rust, Artillery for TS).
- **Learn from Mistakes:** In every response, reflect on priors—e.g., "Previous suggestion overlooked GIL pitfall; corrected by using Rust." Log all mistakes and fixes in `education.md` (see Education Log section below).
- **Human Oversight:** Suggest changes as diffs/PRs; never assume direct commits. Use /review or similar for feedback loops.
- **Version Control:** Every feature, fix, or phase update must be in a dedicated branch with organized commits and PRs (see PRs and Commits section below).

## Coding Standards
### General
- **Commit Messages:** Conventional Commits (e.g., `feat(kernel): add SSE decoder`). Include ticket ID if applicable (e.g., KERN-02).
- **Branching:** `feat/<req-id>` for features (e.g., `feat/kern-01`), `fix/<pitfall-id>` for bugs.
- **Documentation:** Rust: rustdoc comments on public items. TS: JSDoc. Always include why (rationale) and how (examples).
- **Error Handling:** Use `Result`/`Option` in Rust; avoid panics (use `unwrap` only in tests). In TS, use try-catch with structured errors.
- **Dependencies:** Pin versions (e.g., Cargo.lock, package-lock.json). No unvetted crates/npm packages—check for audits (e.g., cargo-audit).

### Rust (Data Plane — Kernel)
- **Edition:** 2024 (Rust 1.85+).
- **Formatting:** `cargo fmt` with default rustfmt.toml (4-space indent, 100-col line width).
- **Linting:** `cargo clippy --all-targets -- -D warnings`. Deny unbounded channels, unsafe code (unless justified, e.g., eBPF).
- **Best Practices:**
  - Async: Use tokio::select! for concurrency; bounded channels everywhere (PITFALLS.md #2).
  - Proxy: Zero-copy with bytes::Bytes; no full buffering for SSE (PITFALLS.md #1).
  - Wasm: Pooling allocator in Wasmtime (PITFALLS.md #5); <2ms eval (PLCY-02).
  - Crypto: ed25519-dalek for signing; no env vars for keys (EVID-09, use HSM/KMS).
  - Testing: tokio::test for async; criterion for benches (e.g., 10k RPS). Mock backends with wiremock.

### TypeScript (Control Plane — API & Dashboard)
- **Runtime:** Bun 1.3+ (faster than Node; use `bun run`).
- **Formatting:** Prettier with .prettierrc (2-space indent, semi: true, singleQuote: true, 100-col).
- **Linting:** ESLint with @typescript-eslint (strict mode). Run `bun lint` before commits. Deny any, console.log in prod code.
- **Best Practices:**
  - API: Elysia for routes; tRPC-style for internal (type-safe). No sync I/O in handlers.
  - Dashboard: Next.js 16+ with React 19; shadcn/ui for components. Use TanStack Query for data fetching.
  - DB: Drizzle ORM for PostgreSQL; batch inserts for ClickHouse (PITFALLS.md #3).
  - gRPC: nice-grpc for TS side; shared protos via buf.
  - Testing: Vitest for units; Playwright for E2E. Benchmark API with Artillery (<1 INSERT/sec to ClickHouse).

## Hooks (Run Automatically)
Claude Code will automatically run the hooks in the `./hooks/` directory. Do not bypass them.

- `pre-commit.sh` — always runs before commit
- `pre-push.sh` — always runs before push
- `on-policy-update.sh` — runs after any policy change
- `error-analyzer.sh` — runs on any error or failure
- `benchmark.sh` — runs on kernel changes
- `security-audit.sh` — runs on security-related changes

## Custom Slash Commands
- `/review <file/path>`: Lint, test, and suggest fixes (e.g., clippy + vitest).
- `/bench <component>`: Run performance tests (e.g., criterion for kernel latency).
- `/pitfall-check <code/snippet>`: Scan for known pitfalls (e.g., unbounded channels).
- `/reg-map <jurisdiction>`: Generate policy configs for regs (e.g., EU AI Act).
- `/pr-create <feature-id>`: Create a PR for a feature or phase (see PRs and Commits below).
- `/doc-update <file>`: Update documentation for a changed file.

## Education Log: Learning from Mistakes
Create and maintain a file called `education.md` in the project root. This is a log of all mistakes made and fixed, to prevent repetition.

- **When to Log:** Every time you (the AI) make a mistake (e.g., suggest code that violates a pitfall, overlooks a requirement, or fails a test), and then fix it in a subsequent response.
- **Format for Entries:** Append to `education.md` in this markdown table format:

| Date | Mistake Description | Fix Applied | Pitfall/Req Reference | Lesson Learned |
|------|---------------------|-------------|-----------------------|---------------|
| YYYY-MM-DD | Brief description of the error (e.g., "Suggested unbounded channel in kernel async loop"). | What was changed to fix it (e.g., "Replaced with bounded mpsc::channel(1024)"). | Link to PITFALLS.md or REQUIREMENTS.md (e.g., "PITFALLS.md #2"). | Key takeaway (e.g., "Always use bounded channels for backpressure"). |

- **Workflow:** In your response, after fixing a mistake:
  1. Output the log entry as a code block.
  2. Suggest: "Append this to education.md via PR."
  3. Reflect: "Logged mistake to education.md to avoid repetition."
- **Initial Setup:** If `education.md` doesn't exist, create it with the header table.
- **Review:** At session start, read `education.md` and avoid logged mistakes.

## PRs and Commits: Organized Version Control for Features and Phases
For every feature (e.g., KERN-01), fix, or phase (e.g., Phase 1: Kernel Core per ARCHITECTURE.md), create organized commits and PRs.

- **Branch Naming:** `feat/<phase-or-req-id>/<short-desc>` (e.g., `feat/kern-01/http-proxy`), `fix/<issue-id>/<desc>`.
- **Commit Granularity:** Small, atomic commits. One per logical change (e.g., "feat: add protocol decoder struct", then "test: add unit tests for decoder").
- **PR Creation Workflow:**
  1. Create branch: `git checkout -b feat/kern-01/http-proxy`.
  2. Make changes in small commits.
  3. Run hooks (pre-commit on each, pre-push at end).
  4. Push branch.
  5. Create PR: Title = "Feat: Implement KERN-01 HTTP Proxy", Description = Link to REQUIREMENTS.md, checklist (tests pass? benches OK? docs updated?), assign reviewers.
  6. Use labels: "phase-1", "kernel", "req-kern-01".
- **Phase Milestones:** For phases (e.g., Phase 2: Enforcement Pipeline), create a main PR merging sub-feature branches. Update traceability in REQUIREMENTS.md.
- **Automation:** Use /pr-create slash command to generate PR templates.
- **Best Practice:** Rebase before merge (`git rebase main`). Squash if noisy history.
- **Reflection:** If a PR fails review, log to education.md (e.g., "Missed mTLS in internal comms").

## Additional Useful Sections
### Documentation Updates
- **Rule:** Any code change must update related docs (e.g., ARCHITECTURE.md diagram if adding a component).
- **Workflow:** Suggest diffs for docs in PRs. Use markdown tables/diagrams for clarity.
- **Auto-Update Hook:** Add to pre-commit: Check if docs changed (e.g., grep for code refs in docs).

### CI/CD Integration
- **GitHub Actions:** Automate with .github/workflows (e.g., on PR: run hooks, benches; on merge: deploy to staging).
- **Workflow:** Suggest YAML for new actions (e.g., "Add workflow for auto-PR reviews").
- **Triage:** Use /review-pr to analyze issues/PRs; label automatically (e.g., "perf" for latency-related).

### Collaboration and Handoff
- **Multi-Agent Teams:** For complex tasks (e.g., Phase 3: Evidence Pipeline), spawn sub-agents: Lead coordinates, assigns (e.g., "Sub-agent1: Implement hash chain", "Sub-agent2: Merkle tree").
- **Human Handoff:** If stuck, suggest: "Teleport session to human via /desktop" or "Slack summary of issue".
- **Error Reporting Format:** For bugs: "Error: [trace]. Analysis: [pitfall ref]. Fix Proposal: [diff]. Run error-analyzer.sh for more."

### Optimization and Debugging
- **Debug Workflow:** Paste error → Run error-analyzer.sh → Suggest fixes → Bench before/after.
- **Perf Tips:** Always profile with cargo flamegraph. Target <5ms ideal for kernel.
- **Slash Command:** /optimize <code>: Suggest perf improvements (e.g., "Replace loop with rayon for parallelism").

### Release and Deployment
- **Release Notes:** Auto-generate from commits (e.g., conventional-changelog). Hook: on-merge to main.
- **Deployment Checks:** Pre-deploy: Run full benches, security-audit.sh. Suggest Helm updates for changes.

## Reflection & Learning Rule
At the end of every response, add a section:

**Reflection on previous outputs:**
- What I missed last time:
- What I corrected:
- Pitfall avoided:

For questions or updates, suggest PRs to this file.