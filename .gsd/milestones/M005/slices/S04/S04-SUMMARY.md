---
id: S04
parent: M005
milestone: M005
provides:
  - Control-plane production warnings burned down
  - Hotspot test warnings resolved
  - Next.js 16 upgrade complete
  - Dashboard table warnings resolved
  - Dockerfile warning debt resolved
  - Planning docs aligned with repo truth
  - Local config no longer tracked in git
  - Control-plane format drift normalized
  - bun run check passes clean
  - Proto files renamed to Buf-compliant naming
  - Evidence and policy distribution proto contracts clean
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# S04: Warning Burndown Next16 Project Truth

**# Phase 33, Task 1 — Summary**

## What Happened

# Phase 33, Task 1 — Summary

Burned down control-plane production and test warnings. Added Biome 2.4.6 as lint+format tool, auto-fixed import ordering, unused imports, and isNaN→Number.isNaN across all 76 source files. Remaining 48 warnings are noExplicitAny in test mocks (acceptable).

# Phase 33, Task 2 — Summary

Finished Next 16 proxy/root cleanup. Upgraded Next.js 15→16, added Prettier, fixed React Compiler lint warnings. Reduced dashboard table warnings to zero.

# Phase 33, Task 3 — Summary

Resolved remaining Dockerfile warning debt. Aligned active planning docs and local config with verified repo truth. Ensured `.claude/settings.local.json` is gitignored.

# Phase 33, Task 4 — Summary

Normalized remaining control-plane repo-wide format drift so `bun run check` passes clean. All 76 source files consistently formatted.

# Phase 33, Task 5 — Summary

Renamed evidence and policy distribution proto files to close the Buf naming gap. Proto contracts now pass `buf lint` cleanly.
