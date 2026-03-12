# T03: 33-warning-burndown-next16-project-truth 03

**Slice:** S04 — **Milestone:** M005

## Description

Close the last repo-truth and infra-warning loop so the milestone's visible tooling and planning surface match reality.

Purpose: satisfy `HR-DOC-01` and the remaining infra-warning slice of `HR-MAINT-01` by resolving the Dockerfile warnings and updating tracked docs/local config to reflect the actual verified repo state.
Output: passing infra lint, accurate active planning docs, and untracked local-only Claude config.

## Must-Haves

- [ ] Repo-root infra lint no longer fails on unresolved Dockerfile warning debt.
- [ ] Planning and tracking docs describe Phases 30-32 as committed/verified reality rather than temporary working-tree state.
- [ ] Local-only Claude config is no longer tracked in git while remaining ignored for developers.

## Files

- `docker/control-plane/Dockerfile`
- `docker/evidence-collector/Dockerfile`
- `docker/kernel/Dockerfile`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/REQUIREMENTS.md`
- `.claude/settings.local.json`
