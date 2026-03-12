---
name: scan
description: >
  Scans the Interdict codebase for best practices violations, security gaps,
  architectural boundary breaks, and code quality issues across Rust, TypeScript,
  and Next.js. Use before merging PRs, when auditing a service, or when
  investigating a security concern. Supports scoped invocation by language, path,
  or concern type.
triggers:
  - /scan
  - /scan-best-practices
  - scan for best practices
  - review code quality
arguments:
  - name: scope
    description: "Scan scope: full, security, architecture, rust, ts (default: full)"
    required: false
    default: full
  - name: target
    description: "Path or service to scan (default: entire repo)"
    required: false
    default: "."
---

<objective>
You are a senior staff engineer performing a thorough code review of the Interdict codebase. Scan for best practices violations, security gaps, architectural boundary breaks, and code quality issues across all languages in the project.
</objective>

<quick_start>
When /scan is invoked:

1. Determine scope from the argument:
   - full — run ALL rule categories across ALL languages + cross-language boundary checks
   - security — run only security and Interdict-specific rules (rules-interdict.md + security sections of language rules)
   - architecture — run only architectural boundary rules (rules-interdict.md Section "Architectural Boundaries")
   - rust — run core + rules-rust.md for kernel and crates only
   - ts — run core + rules-typescript-nextjs.md for control-plane and dashboard only
2. Determine target — if a path or service name is given, scope file reads to that subtree. Otherwise scan the full repo.
3. Read the relevant rule files (listed in rule_files section below).
4. Read source files using available tools. Prioritize:
   - Files changed since last commit (git diff --name-only HEAD~1 or working tree changes)
   - If no recent changes or full scope, read all source files in relevant directories
5. Apply rules from the referenced rule files.
6. Output results in the exact format specified in the output_format section.
</quick_start>

<validation>
Before scanning, validate inputs:
- If scope is not one of: full, security, architecture, rust, ts — warn the user and default to full.
- If target path does not exist — abort with a clear message: "Target path '{target}' not found. Please provide a valid path."
- If a rule file cannot be read — report as configuration issue and continue with remaining rules.
</validation>

<rule_files>
All rules are split into separate files for maintainability. Before scanning, read the relevant rule files.

Always read:
- rules-core.md — applies to every file in every language
- rules-interdict.md — project-specific security + architecture

Per-language (read based on scope):
- rules-rust.md — Rust kernel, crates, evidence-collector rules
- rules-typescript-nextjs.md — TypeScript control-plane and Next.js dashboard rules

These files live alongside this SKILL.md in the same directory.
</rule_files>

<legacy_exemptions>
Files matching these patterns are exempt from style rules but are NEVER exempt from security rules:
- Files containing LEGACY_ in the filename
- Lines or blocks tagged with // @legacy

When a legacy file has style violations, do not report them. When a legacy file has security violations, report them with a note: "(legacy file -- security rules still apply)".
</legacy_exemptions>

<severity_classification>
Every finding is assigned exactly one severity:

High   — Must fix before merge. Security vulnerability, data leak risk, architectural boundary violation, CLAUDE.md invariant broken, any of the owner's top-10 pet peeves when security-related.
Medium — Should fix in this PR. Code quality issue, missing type safety, SRP/DRY violation, any of the owner's top-10 pet peeves when not security-related.
Low    — Fix when convenient. Style improvement, minor naming issue, missing doc comment on internal function.
Info   — Observation only. Positive highlights, suggestions for future improvement.
</severity_classification>

<severity_escalation>
Automatic severity escalation — owner's pet peeves (always at least Medium):

1.  Hard-coded domains or IPs anywhere — High
2.  `any` type in TypeScript (especially API handlers or auth paths) — Medium (High if in auth/security path)
3.  Policy enforcement bypass or fail-open widening without explicit audit — High
4.  Missing auth middleware on a control-plane route — High
5.  Blocking I/O (std::fs, std::net, thread::sleep) in async Rust hot path — High
6.  ClickHouse queries using `{param:DateTime}` type hint (should be `DateTime64(3)`) — Medium
7.  ISO 8601 string with T/Z passed to ClickHouse without normalization — Medium
8.  Evidence hash computed AFTER mutation/redaction (must be pre-mutation) — High
9.  Plaintext secrets, prompts, or API keys in logs — High
10. Commented-out code (delete it or make a ticket) — Medium
</severity_escalation>

<output_format>
Use this format exactly:

## Scan Results -- /scan {scope}
**Summary**
High: {n}  Medium: {n}  Low: {n}  Info: {n}

### High (must fix before merge)
1. `{file}:{line}` -- {one-sentence description}
   -> {which rule or principle this violates}
   Suggested fix: {terse fix description}

### Medium
...

### Low / Info
...

**Critical fix snippets** (only for High findings, diff format)
```diff
- {old code}
+ {new code}
```

---
All rules derived from CLAUDE.md + Interdict security model (2026).
</output_format>

<output_rules>
- Summary table always first.
- Findings grouped by severity, numbered sequentially across all groups.
- Each finding: file:line + one-sentence why + suggested fix.
- Diff snippets only for High findings, only when the fix is fewer than 8 lines.
- No lectures, no explanations of what DRY means, no filler.
- Final line is always the attribution line shown above.
</output_rules>

<cross_language_checks>
Run on /scan full and /scan architecture. After scanning individual files, perform these cross-cutting checks:

1. Import boundary violations — Grep for imports that cross architectural boundaries (see rules-interdict.md Architectural Boundaries section).
2. Duplicate logic — Look for near-identical functions or blocks across services that should be in a shared module.
3. Inconsistent error patterns — Compare error handling approaches across services; flag if one service swallows errors that others propagate.
4. Config drift — Check if environment variable names, default values, or feature flags are inconsistent across services (e.g., CLICKHOUSE_URL in control-plane vs evidence-collector).
5. Shared type drift — If the same data structure (e.g., EvidenceBundle, PolicyAction) is defined in multiple services, flag if the definitions have diverged.
</cross_language_checks>

<error_handling>
- Target path not found — report to user and abort scan.
- Rule file unreadable — report as configuration issue, continue scanning with remaining rules.
- git diff unavailable (no git repo or no commits) — fall back to scanning all source files in the target directory.
- No source files found in target — report "No scannable files found in '{target}'" and abort.
</error_handling>

<success_criteria>
- Output begins with the summary table (High/Medium/Low/Info counts).
- Every finding includes file:line, a one-sentence description, the violated rule, and a suggested fix.
- High findings include diff snippets when the fix is fewer than 8 lines.
- Output ends with the attribution line.
- No findings are reported for legacy files' style violations.
- Security findings on legacy files include the "(legacy file -- security rules still apply)" note.
- All rule files relevant to the scope were read before scanning.
- Input scope and target were validated before scanning began.
</success_criteria>
