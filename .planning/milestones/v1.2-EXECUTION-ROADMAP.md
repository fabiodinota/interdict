# v1.2 Trustworthiness & Hardening -- Phased Execution Roadmap

**Status:** planned
**Created:** 2026-03-10
**Scope:** convert the current assessment into an ordered execution program focused on truthfulness, trust, verification, hardening, and operational readiness

## Why This Milestone Exists

v1.1 shipped a real pilot-grade platform, but the current codebase still has a gap between what Interdict claims and what Interdict can currently prove. The next milestone must close that gap before net-new feature expansion.

This milestone is not a feature milestone. It is a correctness, trust, and hardening milestone.

## Hard Ordering Rules

1. No net-new feature work before Phase 19 exits.
2. Do not market full cryptographic evidence verification before Phase 16 exits.
3. Do not market enterprise-ready, production-grade, or air-gapped deployment aggressively before Phases 23 and 24 exit.
4. JS/TS changes must be merge-blocked by CI once Phase 17 lands.
5. ClickHouse must stop acting as an operational workflow source of truth by the end of Phase 20.
6. Any operator-facing dashboard wording must match actual backend behavior at every phase boundary.

## Phase Summary

| Phase | Name | Primary Goal | Depends On |
| --- | --- | --- | --- |
| 16 | Evidence Verification Truth | Make evidence verification cryptographically and semantically correct across collector, control plane, CLI verifier, and dashboard | none |
| 17 | Auth Secret Hardening and JS Gates | Remove raw SAML handoff token persistence and make control-plane/dashboard quality gates real | 16 can proceed in parallel conceptually, but Phase 17 must complete before broad TS work |
| 18 | Reporting Integrity and Scope Truth | Stop silent report corruption and make policy scope enforcement real | 16, 17 |
| 19 | Identity Attribution and Durable Evidence Delivery | Carry real actor identity into evidence and prevent silent evidence loss | 16, 17, 18 |
| 20 | Review Workflow Consolidation | Replace split review-state architecture with one operational source of truth | 19 |
| 21 | Kernel and Control Plane Maintainability | Reduce change risk in core code paths and remove high-risk dynamic typing | 17, 20 |
| 22 | Dashboard Reliability and Operator Trust | Add automated dashboard confidence and align operator-facing UX with backend truth | 16, 17, 18, 21 |
| 23 | Deployment Truth and Artifact Hardening | Make deployment assets honest, hardened, and compatible with offline requirements | 18, 19, 21 |
| 24 | Platform Hardening and Release Gate | Finish Kubernetes hardening, observability, dependency hygiene, and final claim-tightening gate | 22, 23 |

## Phase 16 -- Evidence Verification Truth

**Objective**

Make the evidence verification path correct enough that the same real bundle yields the same result in the collector model, the Rust verifier, the control plane, and the dashboard.

**Why first**

Interdict's strongest differentiator is tamper-evident evidence. Right now the product surface overclaims that capability while the verification implementations disagree.

**In scope**

- Align chain semantics across services.
- Align signature payload semantics across services.
- Decide whether Merkle verification is supported now or explicitly deferred.
- Remove any UI/API wording that implies more than the implementation can prove.
- Add cross-language golden-fixture verification tests.

**Files and systems most likely touched**

- `control-plane/src/modules/evidence/service.ts`
- `dashboard/src/app/(dashboard)/evidence/page.tsx`
- `dashboard/src/components/evidence/VerificationStepper.tsx`
- `crates/evidence-collector/src/grpc/service.rs`
- `crates/interdict-verify/src/chain.rs`
- `crates/interdict-verify/src/signature.rs`
- `proto/interdict/evidence/v1/evidence.proto`

**Required changes**

1. Standardize one canonical signed payload format and one canonical chain-verification model.
2. Fix genesis handling in the control plane so sequence numbering matches collector and Rust verifier behavior.
3. Fix signature verification so the control plane verifies the same payload that the collector signs.
4. Decide whether Merkle verification remains deferred or is fully implemented in this phase; remove ambiguity.
5. Add a golden fixture generated from the collector path and replay it in all verifier surfaces.
6. Update dashboard wording so it reports exactly what is verified.

**Exit criteria**

- A collector-generated bundle verifies identically in `interdict-verify`, the control plane, and the dashboard.
- No sequence-number disagreement remains between services.
- No signature-payload disagreement remains between services.
- The UI no longer implies full Merkle verification unless it is truly implemented.

**Must not happen**

- No further evidence-related feature work before this semantic alignment is done.
- No workaround that makes the dashboard look green while the Rust verifier still disagrees.

## Phase 17 -- Auth Secret Hardening and JS Gates

**Objective**

Remove the last obviously weak auth credential persistence path and make JavaScript/TypeScript correctness non-optional at merge time.

**Why now**

The current auth flow is materially improved versus URL token handoff, but raw bearer persistence still exists. At the same time, the repo can currently merge JS regressions with green Rust CI.

**In scope**

- Remove raw session-token persistence from the SAML handoff flow.
- Preserve single-use, short-lived exchange semantics.
- Fix current control-plane type-check failures.
- Make dashboard linting real or remove the fake lint path.
- Add control-plane and dashboard validation to CI.

**Files and systems most likely touched**

- `control-plane/src/db/schema/auth.ts`
- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/auth/index.ts`
- `control-plane/src/modules/auth/middleware.ts`
- `control-plane/src/index.ts`
- `control-plane/src/modules/auth/saml/handlers.ts`
- `control-plane/src/modules/regulatory/index.ts`
- `dashboard/package.json`
- `.github/workflows/ci-quality-security.yml`

**Required changes**

1. Replace raw `sessionToken` persistence with a safer reference or encrypted transport mechanism.
2. Keep the exchange path atomic and single-use.
3. Resolve current TypeScript failures in auth, evidence, regulatory, and top-level error handling.
4. Add `control-plane` test and type-check jobs to CI.
5. Add `dashboard` build validation to CI.
6. Add a proper ESLint config for the dashboard or remove the broken lint command until it is real.

**Exit criteria**

- No raw browser bearer token is stored in Postgres for the SAML handoff path.
- `bunx tsc --noEmit` passes in `control-plane/`.
- `bun test` passes in `control-plane/`.
- `bun run build` passes in `dashboard/` and is enforced in CI.
- Dashboard lint is either real and green or intentionally removed as a fake gate.

**Must not happen**

- No auth hardening that breaks SAML bootstrap without replacement tests.
- No CI job added as optional or informational only.

## Phase 18 -- Reporting Integrity and Scope Truth

**Objective**

Ensure Interdict does not silently generate misleading reports and does not pretend org/department/team policy scope exists where it is still placeholder behavior.

**Why now**

Once evidence verification and auth/gates are fixed, the next trust problem is operator truth: reports must fail honestly, and scoped enforcement must be real.

**In scope**

- Replace report-service silent fallbacks with explicit failures.
- Fix N+1 and partition-pruning issues in reporting.
- Persist and enforce policy scope assignments.
- Populate gRPC policy scope fields truthfully.

**Files and systems most likely touched**

- `control-plane/src/modules/reports/service.ts`
- `control-plane/src/modules/reports/index.ts`
- `control-plane/src/modules/distribution/server.ts`
- `control-plane/src/modules/compiler/worker.ts`
- `control-plane/src/db/schema/policies.ts`
- `proto/interdict/policy/v1/policy_distribution.proto`

**Required changes**

1. Replace empty/zero fallbacks in reports with explicit upstream failure behavior.
2. Fix query inefficiencies that will distort or degrade reporting under scale.
3. Introduce persisted scope assignments for org, department, and team.
4. Filter policy snapshots and delta payloads by real scope.
5. Add tests proving mixed-scope policy sets are delivered correctly.

**Exit criteria**

- Reports cannot silently return fake success when storage layers fail.
- Scope fields in distribution payloads are populated truthfully.
- Kernels only receive policies intended for their scope.

**Must not happen**

- No scope logic implemented only in comments or TODOs.
- No fallback behavior that keeps dashboards looking healthy while data is broken.

## Phase 19 -- Identity Attribution and Durable Evidence Delivery

**Objective**

Make evidence rows attributable to real actors and make evidence delivery durable enough that high-assurance operation does not silently lose audit records.

**Why this is the feature-freeze boundary**

Until identity and evidence durability are fixed, Interdict still has a serious auditability gap.

**In scope**

- Propagate actor and department metadata into the kernel evidence path.
- Replace best-effort evidence buffering with durable delivery semantics.
- Add visibility into drops, retries, and queue health.

**Files and systems most likely touched**

- `crates/kernel/src/proxy/connect.rs`
- `crates/kernel/src/evidence/mod.rs`
- `crates/kernel/src/evidence/bundle.rs`
- `crates/kernel/src/policy/session.rs`
- `crates/kernel/src/main.rs`
- `crates/kernel/src/evidence/client.rs`

**Required changes**

1. Define how authenticated user and department metadata reach the kernel.
2. Replace `anonymous` and `unknown` defaults in normal authenticated flows.
3. Add durable evidence spooling or WAL-backed retry behavior.
4. Expose metrics for queue pressure, retries, drops, and flush health.
5. Define conservative behavior for high-assurance profiles when durable evidence delivery is unavailable.

**Exit criteria**

- Authenticated flows persist real actor and department metadata into evidence.
- Evidence loss behavior is explicit, measured, and tested.
- High-assurance mode cannot silently proceed while evidence is being dropped.

**Must not happen**

- No fake attribution layer that rewrites identity after the fact in the control plane.
- No hidden evidence loss behind warning logs only.

## Phase 20 -- Review Workflow Consolidation

**Objective**

Replace the split review-state model with one workflow architecture and one operational source of truth.

**Why now**

The current review design is split between kernel-local SQLite persistence and control-plane polling from ClickHouse. That is acceptable as a bridge, not as a durable platform architecture.

**In scope**

- Choose the permanent review-state architecture.
- Remove ClickHouse as workflow source.
- Preserve analytics visibility while separating workflow state from analytics state.

**Files and systems most likely touched**

- `crates/kernel/src/policy/layer3/queue.rs`
- `crates/kernel/src/policy/layer3/store.rs`
- `control-plane/src/modules/reviews/service.ts`
- `control-plane/src/modules/reviews/index.ts`
- Evidence ingest path where escalations originate

**Required changes**

1. Decide whether review items are created at evidence ingest or through a dedicated queue/service.
2. Remove timer-driven ClickHouse polling as the operational ingestion mechanism.
3. Ensure review lifecycle state lives in one shared authoritative store.
4. Add tests for multi-kernel, duplicate, retry, and SLA-expiry behavior.

**Exit criteria**

- Review creation is deterministic and transactional.
- ClickHouse is read-model only for reviews.
- Multi-node review behavior is supportable.

**Must not happen**

- No partial migration where both SQLite and a new workflow source remain equally authoritative.

## Phase 21 -- Kernel and Control Plane Maintainability

**Objective**

Reduce the blast radius of future changes by decomposing oversized core files and removing dynamic typing from the most sensitive TypeScript modules.

**Why now**

After truth and workflow fixes, the next risk is change safety. The current architecture is correct enough to keep, but too many critical behaviors are concentrated in a few files and too many control-plane routes rely on `any`.

**In scope**

- Split kernel change-magnet modules into smaller units.
- Remove `any` from high-risk control-plane paths first.
- Standardize typed route contexts and service boundaries.

**Files and systems most likely touched**

- `crates/kernel/src/proxy/connect.rs`
- `crates/kernel/src/policy/mod.rs`
- `control-plane/src/modules/evidence/index.ts`
- `control-plane/src/modules/reviews/index.ts`
- `control-plane/src/modules/reports/index.ts`
- `control-plane/src/modules/regulatory/index.ts`
- `control-plane/src/modules/audit/index.ts`

**Required changes**

1. Extract evidence emission, session integration, and relay decision code from the kernel tunnel path.
2. Extract policy orchestration seams from `policy/mod.rs`.
3. Introduce typed context helpers for auth, evidence, reviews, reports, and regulatory routes.
4. Remove broad `db: any`, `ctx: any`, and `as any` usage from critical modules.

**Exit criteria**

- Critical kernel behavior is spread across smaller, testable modules.
- High-risk control-plane routes compile without loose route context typing.
- Refactors become less dangerous because seam boundaries are explicit.

**Must not happen**

- No semantic policy changes mixed into decomposition work unless covered by tests.

## Phase 22 -- Dashboard Reliability and Operator Trust

**Objective**

Make the dashboard a trustworthy operator surface rather than a largely manual verification layer.

**Why now**

Only after backend truth and maintainability improve does it make sense to formalize UI confidence.

**In scope**

- Add dashboard automated coverage for critical workflows.
- Validate BFF proxy behavior, auth bootstrap/logout, evidence result rendering, and reporting flows.
- Reduce unnecessary client-only execution where possible.

**Files and systems most likely touched**

- `dashboard/src/app/api/proxy/[...path]/route.ts`
- `dashboard/src/app/api/auth/saml-callback/route.ts`
- `dashboard/src/app/api/auth/logout/route.ts`
- `dashboard/src/app/(dashboard)/evidence/page.tsx`
- `dashboard/src/components/evidence/VerificationStepper.tsx`
- `dashboard/src/components/layout/TopBar.tsx`
- Dashboard test harness and config files

**Required changes**

1. Add dashboard tests for auth lifecycle, proxy forwarding, evidence rendering, and report downloads.
2. Verify that operator-visible states match backend truth states, especially around partial verification and failure conditions.
3. Reduce gratuitous client-only rendering where it hurts reliability without adding value.

**Exit criteria**

- The dashboard has automated coverage for its most trust-sensitive flows.
- UI states for pass, fail, partial, and error are tested.
- The BFF proxy path is treated as a first-class tested surface.

**Must not happen**

- No business logic migration into the browser to avoid backend fixes.

## Phase 23 -- Deployment Truth and Artifact Hardening

**Objective**

Make deployment assets honest, hardened, and compatible with the platform claims around production and offline operation.

**Why now**

The repo already has Compose and Helm, but the artifact path is not fully hardened and the air-gapped story is not yet demonstrable.

**In scope**

- Separate local-dev defaults from hardened deployment defaults.
- Make all runtime containers non-root by default.
- Remove internet-required build steps from the artifact path where they break offline claims.
- Update planning and public-facing docs to reflect actual deployability.

**Files and systems most likely touched**

- `docker/control-plane/Dockerfile`
- `docker/dashboard/Dockerfile`
- `docker-compose.yml`
- `env.example`
- `helm/interdict/values.yaml`
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- root `README` (new)

**Required changes**

1. Add non-root runtime users to the control-plane and dashboard images.
2. Separate secure production guidance from convenience-first local defaults.
3. Replace build-time remote OPA download with a vendored or prepackaged artifact path.
4. Reconcile docs so air-gapped compatibility is either demonstrably supported or explicitly narrowed.
5. Publish a root README that explains the real current state of the platform.

**Exit criteria**

- All runtime images run non-root by default.
- Production guidance does not normalize default credentials.
- Offline build path is documented and reproducible.
- Planning and top-level docs match current reality.

**Must not happen**

- No documentation that still claims more than the artifacts can prove.

## Phase 24 -- Platform Hardening and Release Gate

**Objective**

Finish the operational hardening work required before strong production claims: Kubernetes security controls, observability, dependency hygiene, developer verification, and final claim tightening.

**Why last**

This is the release gate phase. It should land only after the platform's core truth model is repaired.

**In scope**

- Add missing Kubernetes hardening primitives.
- Add metrics and correlation for critical flows.
- Clean dependency graph and close known audit issues.
- Make local verification reproducible.
- Run a final product-claim review.

**Files and systems most likely touched**

- `helm/interdict/templates/**`
- `.github/workflows/ci-quality-security.yml`
- `control-plane/package.json`
- `dashboard/package.json`
- `dashboard/bun.lock`
- `dashboard/package-lock.json`
- `crates/kernel/Cargo.toml`
- `crates/evidence-collector/Cargo.toml`
- Developer bootstrap/setup docs

**Required changes**

1. Add `NetworkPolicy`, `PodDisruptionBudget`, and targeted autoscaling support where justified.
2. Add platform metrics for evidence durability, verification results, review backlog, policy distribution, and report failures.
3. Clean known dependency drift and remove confirmed unused dependencies.
4. Resolve or explicitly justify known audit findings.
5. Document reproducible local verification, including Windows prerequisites.
6. Run a final wording pass across the dashboard and docs so every major claim is backed by tested behavior.

**Exit criteria**

- Kubernetes manifests express the security and availability model, not just deployment.
- Core operational metrics exist for the most failure-prone subsystems.
- Dependency strategy is singular and intentional.
- A release-readiness review can point to tests, artifacts, and docs without contradiction.

**Must not happen**

- No production-readiness announcement before this gate exits.

## Cross-Phase Verification Gates

The following checks become progressively stricter as phases land, but by the end of the milestone they must all be green and required:

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test -p kernel --test content_inspection_test`
- `bun test` in `control-plane/`
- `bunx tsc --noEmit` in `control-plane/`
- `bun run build` in `dashboard/`
- JS dependency audit review with documented dispositions

## Milestone Exit Definition

The milestone is complete only when all of the following are true:

1. Evidence verification is internally consistent across all verification surfaces.
2. Auth bootstrap no longer persists raw bearer credentials.
3. JS/TS correctness is enforced in CI.
4. Reporting and policy-scope behavior are honest and complete.
5. Evidence attribution and durability match audit expectations.
6. Review workflow architecture has one source of truth.
7. Core kernel and control-plane change hotspots have been reduced.
8. Dashboard trust-sensitive workflows are automated and verified.
9. Deployment artifacts and docs no longer overclaim production or air-gapped readiness.
10. Final product language matches what the platform can actually prove.

## Immediate Next Step

Start with Phase 16 and do not branch into later work until the verification contract is nailed down in writing and backed by fixtures.
