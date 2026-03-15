---
estimated_steps: 4
estimated_files: 3
---

# T04: Project tracking updates

**Slice:** S08 — Documentation, Accessibility & Polish
**Milestone:** M007

## Description

Update project tracking documents to reflect v1.5 Production Readiness status. PROJECT.md still shows v1.2; README.md doesn't reference operator documentation; STATE.md needs M007 marked complete. This supports HR-DOC-01 (planning/state docs reflect verified state).

## Steps

1. Update `.gsd/PROJECT.md`:
   - Add "Production Readiness — v1.5" section under Requirements → Validated, documenting all M007 deliverables: hot-path relay test coverage, layer 3 queue/signing tests, dependency cleanup, expanded test coverage (46 dashboard + 26 control-plane test files), CI/CD release pipeline with signed images, CSP nonce hardening, Helm network policies, DevOps maturity (multi-platform builds, monitoring, backup, env validation), operator documentation, and WCAG AA accessibility.
   - Keep existing v1.0, v1.1, v1.2 sections unchanged.

2. Update `README.md`:
   - Change "Current Status" section: v1.5 is current, v1.2 is shipped.
   - Add "Documentation" section (or expand existing) with links to `docs/operator/guide.md`, `docs/operator/troubleshooting.md`, `docs/api/rest.md`, `docs/api/grpc.md`.
   - Update "Production Considerations" to reference `scripts/validate-env.sh` for pre-flight checks and `docs/operator/guide.md` for complete instructions.

3. Update `.gsd/STATE.md`:
   - Mark S08 as complete
   - Set phase to `complete`
   - Update next action to indicate M007 is done

4. Verify all updates are consistent and accurate.

## Must-Haves

- [ ] PROJECT.md has v1.5 Production Readiness section with M007 deliverables
- [ ] README.md current status shows v1.5
- [ ] README.md references operator documentation
- [ ] STATE.md shows M007 complete

## Verification

- `grep "v1.5" .gsd/PROJECT.md` — v1.5 section exists
- `grep "Production Readiness" .gsd/PROJECT.md` — describes M007 deliverables
- `grep "docs/operator" README.md` — references operator docs
- `grep "v1.5" README.md` — current status updated

## Observability Impact

- **Signals changed:** None — static documentation updates only.
- **Future inspection:** `grep "v1.5" .gsd/PROJECT.md README.md` confirms version tracking consistency. `grep "docs/operator" README.md` confirms doc references wired. `grep "complete" .gsd/STATE.md` confirms milestone closure.
- **Failure visibility:** Stale version numbers in PROJECT.md/README.md or incomplete STATE.md would be caught by slice-level verification grep checks.

## Inputs

- `.gsd/PROJECT.md` — current project doc at v1.2
- `README.md` — current README showing v1.2 as in-progress
- `.gsd/STATE.md` — current state showing S08 in planning
- All S01–S07 summaries — source of truth for what was delivered

## Expected Output

- `.gsd/PROJECT.md` — updated with v1.5 Production Readiness requirements section
- `README.md` — updated status and documentation references
- `.gsd/STATE.md` — M007 marked complete
