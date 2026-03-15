#!/usr/bin/env bash
# gsd-patch-clearPathCache.sh
#
# Re-applies two GSD fixes after npm updates:
#
# 1. clearPathCache fix (auto.ts) — #433
#    BUG: paths.ts caches directory listings in-memory (dirListCache) but
#    auto.ts never calls clearPathCache() between dispatch cycles. When the
#    agent writes an artifact (e.g. S01-RESEARCH.md), the next dispatch
#    cycle still sees the stale cached listing and thinks the file doesn't
#    exist → infinite research-slice loop.
#    FIX: Import clearPathCache from paths.js and call it at the top of
#    dispatchNextUnit() so every cycle sees fresh directory listings.
#    Upstream issue: https://github.com/gsd-build/gsd-2/issues/433
#
# 2. selfHealRuntimeRecords for guided-flow (guided-flow.ts) — #436
#    BUG: guided-flow.ts (manual mode wizard) has no awareness of stale
#    runtime records in .gsd/runtime/units/. If auto-mode crashes mid-unit,
#    stale records persist until the next /gsd auto run.
#    FIX: Add selfHealRuntimeRecords() to guided-flow.ts, called at the top
#    of showSmartEntry() before the crash lock check.
#    Upstream issue: https://github.com/gsd-build/gsd-2/issues/436
#
# Usage:
#   bash scripts/gsd-patch-clearPathCache.sh
#
# Safe to run multiple times — checks if already patched before applying.

set -euo pipefail

GSD_AUTO="$HOME/.gsd/agent/extensions/gsd/auto.ts"

if [[ ! -f "$GSD_AUTO" ]]; then
  echo "ERROR: $GSD_AUTO not found. Is GSD installed?"
  exit 1
fi

# Check if already patched
if grep -q "clearPathCache" "$GSD_AUTO" 2>/dev/null; then
  echo "SKIP: clearPathCache already present in auto.ts — patch not needed."
  exit 0
fi

echo "Applying clearPathCache patch to auto.ts..."

# 1. Add clearPathCache to the import from paths.js
#    Find the closing "} from "./paths.js";" and add clearPathCache before the closing brace.
if grep -q 'buildMilestoneFileName, buildSliceFileName, buildTaskFileName,' "$GSD_AUTO"; then
  sed -i 's/buildMilestoneFileName, buildSliceFileName, buildTaskFileName,/buildMilestoneFileName, buildSliceFileName, buildTaskFileName,\n  clearPathCache,/' "$GSD_AUTO"
  echo "  ✓ Added clearPathCache to import"
else
  echo "  ⚠ Could not find expected import line — trying alternative pattern..."
  # Fallback: add import after the paths.js import block
  sed -i '/from "\.\/paths\.js";/a import { clearPathCache } from "./paths.js";' "$GSD_AUTO"
  echo "  ✓ Added clearPathCache import (fallback pattern)"
fi

# 2. Add clearPathCache() call at the top of dispatchNextUnit
#    Insert before "let state = await deriveState(basePath);"
if grep -q 'let state = await deriveState(basePath);' "$GSD_AUTO"; then
  sed -i '/let state = await deriveState(basePath);/{
    i\  // Invalidate cached directory listings so newly-written artifacts\n  // (e.g. S01-RESEARCH.md created by the previous unit) are visible\n  // to resolveSliceFile / resolveFile lookups this cycle.\n  clearPathCache();\n
  }' "$GSD_AUTO"
  echo "  ✓ Added clearPathCache() call in dispatchNextUnit"
else
  echo "  ✗ Could not find deriveState call — manual patch needed"
  exit 1
fi

# Verify
if grep -q "clearPathCache" "$GSD_AUTO"; then
  echo ""
  echo "DONE: auto.ts patch applied successfully."
  echo "The fix prevents stale directory cache from causing infinite dispatch loops."
else
  echo "ERROR: auto.ts patch verification failed."
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PATCH 2: selfHealRuntimeRecords in guided-flow.ts (#436)
# ═══════════════════════════════════════════════════════════════════════════════

GSD_GUIDED="$HOME/.gsd/agent/extensions/gsd/guided-flow.ts"

if [[ ! -f "$GSD_GUIDED" ]]; then
  echo ""
  echo "SKIP: $GSD_GUIDED not found — guided-flow patch skipped."
  exit 0
fi

if grep -q "selfHealRuntimeRecords" "$GSD_GUIDED" 2>/dev/null; then
  echo ""
  echo "SKIP: selfHealRuntimeRecords already present in guided-flow.ts — patch not needed."
  exit 0
fi

echo ""
echo "Applying selfHealRuntimeRecords patch to guided-flow.ts..."

# 1. Add imports for listUnitRuntimeRecords and clearUnitRuntimeRecord
#    Insert after the crash-recovery import line
if grep -q 'from "./crash-recovery.js"' "$GSD_GUIDED"; then
  sed -i '/from "\.\/crash-recovery\.js";/a import {\n  listUnitRuntimeRecords,\n  clearUnitRuntimeRecord,\n} from "./unit-runtime.js";\nimport { resolveExpectedArtifactPath } from "./auto.js";' "$GSD_GUIDED"
  echo "  ✓ Added unit-runtime and resolveExpectedArtifactPath imports"
else
  echo "  ✗ Could not find crash-recovery import — manual patch needed"
  exit 1
fi

# 2. Add selfHealRuntimeRecords() function
#    Insert before showSmartEntry (the first export async function after the discuss helpers)
if grep -q 'export async function showSmartEntry' "$GSD_GUIDED"; then
  sed -i '/^export async function showSmartEntry/i \
/**\
 * Self-heal: scan runtime records in .gsd/ and clear stale ones.\
 * Clears records where the expected artifact already exists (completed but\
 * closeout did not finish), and records stuck in dispatched/timeout phase\
 * (process died mid-unit).\
 */\
async function selfHealRuntimeRecords(base: string, ctx: ExtensionContext): Promise<void> {\
  try {\
    const records = listUnitRuntimeRecords(base);\
    let healed = 0;\
    for (const record of records) {\
      const { unitType, unitId, phase } = record;\
      const artifactPath = resolveExpectedArtifactPath(unitType, unitId, base);\
      if (artifactPath && existsSync(artifactPath)) {\
        // Artifact exists — unit completed but closeout did not finish.\
        clearUnitRuntimeRecord(base, unitType, unitId);\
        healed++;\
      } else if (phase === "dispatched" || phase === "timeout") {\
        // Process died mid-unit — clear the stale record.\
        clearUnitRuntimeRecord(base, unitType, unitId);\
        healed++;\
      }\
    }\
    if (healed > 0) {\
      ctx.ui.notify(\`Self-heal: cleared ${healed} stale runtime record(s).\`, "info");\
    }\
  } catch {\
    // Non-fatal — self-heal should never block wizard startup\
  }\
}\
' "$GSD_GUIDED"
  echo "  ✓ Added selfHealRuntimeRecords() function"
else
  echo "  ✗ Could not find showSmartEntry — manual patch needed"
  exit 1
fi

# 3. Add selfHealRuntimeRecords() call at the top of showSmartEntry,
#    before the crash lock check
if grep -q '// Check for crash from previous auto-mode session' "$GSD_GUIDED"; then
  sed -i '/\/\/ Check for crash from previous auto-mode session/i \
  // Self-heal: clear stale runtime records from crashed auto-mode sessions\
  await selfHealRuntimeRecords(basePath, ctx as unknown as ExtensionContext);\
' "$GSD_GUIDED"
  echo "  ✓ Added selfHealRuntimeRecords() call in showSmartEntry"
else
  echo "  ✗ Could not find crash lock comment — manual patch needed"
  exit 1
fi

# Verify
if grep -q "selfHealRuntimeRecords" "$GSD_GUIDED"; then
  echo ""
  echo "DONE: guided-flow.ts patch applied successfully."
  echo "Manual-mode wizard now self-heals stale runtime records on startup."
else
  echo "ERROR: guided-flow.ts patch verification failed."
  exit 1
fi
