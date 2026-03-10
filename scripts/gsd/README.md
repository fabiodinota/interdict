# GSD Phase Loop

This folder contains a phase-by-phase automation loop for the new `v1.2 Trustworthiness & Hardening` roadmap.

## What It Does

For each target phase, the loop runs fresh `opencode` sessions in this exact order:

1. `/gsd-research-phase <phase>`
   - This invokes the `gsd-phase-researcher` flow and writes `RESEARCH.md`.
2. `/gsd-plan-phase <phase> --skip-research`
   - This turns the research into one or more `PLAN.md` files.
3. `/gsd-execute-phase <phase>`
   - This invokes `gsd-executor` through the normal orchestrator and also triggers phase verification.
4. If the generated `VERIFICATION.md` has `status: gaps_found`, it automatically runs:
   - `/gsd-plan-phase <phase> --gaps`
   - `/gsd-execute-phase <phase> --gaps-only`
5. It stops immediately if a phase needs human verification or if any command fails.

Because every step is a new `opencode run` invocation, context is naturally reset between research, planning, execution, gap-closure retries, and the next phase. No manual `/clear` step is needed.

## Run It

From the repo root:

```bash
node scripts/gsd/run-phase-loop.mjs
```

On Windows PowerShell:

```powershell
.\scripts\gsd\run-phase-loop.ps1
```

## Useful Flags

Run a subset:

```bash
node scripts/gsd/run-phase-loop.mjs --from 16 --to 18
```

Run explicit phases only:

```bash
node scripts/gsd/run-phase-loop.mjs --phases 16,17,19
```

Preview without executing anything:

```bash
node scripts/gsd/run-phase-loop.mjs --dry-run
```

Force research or planning even if artifacts already exist:

```bash
node scripts/gsd/run-phase-loop.mjs --force-research --force-plan
```

Limit automatic gap-closure retries:

```bash
node scripts/gsd/run-phase-loop.mjs --max-gap-cycles 2
```

Pass model settings through to `opencode`:

```bash
node scripts/gsd/run-phase-loop.mjs --model openai/gpt-5.4 --variant high
```

## Output

Each run writes automation state under:

```text
.planning/automation-logs/phase-loop-<timestamp>/
```

Important files:

- `state.json` - current run state and per-phase result
- `commands.json` - command history the loop invoked
- `summary.md` - human-readable phase summary

## Stop Conditions

The loop stops when any of these happen:

- `VERIFICATION.md` reports `status: human_needed`
- a command exits non-zero
- expected artifacts are missing (`RESEARCH.md`, `PLAN.md`, or `VERIFICATION.md`)
- gap closure exceeds `--max-gap-cycles`

When it stops, read the latest `summary.md` and the relevant phase `VERIFICATION.md` before resuming with `--from <phase>` or `--phases <list>`.
