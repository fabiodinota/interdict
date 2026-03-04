# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-01
**Phases:** 7 | **Plans:** 28

### What Was Built
- Streaming-first Rust proxy kernel intercepting AI traffic across HTTP/1.1, HTTP/2, SSE, gRPC, WebSockets
- 3-layer policy engine (Wasm/Regorus + NLP classifier + human review queue) with hot-reload via ArcSwap
- PII/financial/secrets detection with category-tagged redaction in prompts and streaming responses
- Cryptographic evidence pipeline: SHA-256 hash chains, Ed25519 signatures, Merkle trees, S3 WORM anchoring
- Bun + Elysia control plane API with policy CRUD, Rego-to-Wasm compiler, vendor registry, 8 regulatory framework packs
- gRPC push-based policy distribution with real-time hot-reload and session context tracking

### What Worked
- Streaming-first design from Phase 1 eliminated throwaway non-streaming code — every line written was production-relevant
- Wave-based plan parallelization within phases kept velocity high without dependency conflicts
- Phase 6.1 (inserted decimal phase) cleanly closed integration gaps identified by milestone audit
- Strict control-plane/data-plane separation prevented architectural drift across 7 phases
- Fail-closed defaults caught several edge cases during integration testing that would have been security holes
- GSD workflow with plan-check and verifier agents caught issues before they accumulated

### What Was Inefficient
- Phase 4 ROADMAP.md showed 1/4 plans complete but disk had 4/4 summaries — stale ROADMAP checkbox tracking caused confusion
- Phase 5 ROADMAP.md showed 0/4 plans but had 6 plans on disk — plan count diverged from original roadmap during execution
- Evidence stubs (actor_identity='anonymous') will require rework in Phase 7 — could have designed the interface more cleanly upfront
- L2 NLP classifier uses stub feature extraction — real ONNX model integration still needed
- Benchmark coverage for KERN-08 (10k RPS) only tests single-connection, not concurrent load

### Patterns Established
- `ProxyService::with_*()` builder pattern for composable capability injection
- ArcSwap for zero-downtime atomic policy swaps
- DashMap for lock-free concurrent caches (cert cache, session store)
- Per-kernel ChainManager for deterministic hash linkage
- Service factory pattern (createPolicyService(db)) in TypeScript for testability
- Evidence buffer with bounded mpsc channel and background flusher for async audit
- Dual-check patterns (fast-path middleware + policy pipeline) for defense in depth

### Key Lessons
1. Wire integration points early — Phase 6.1 would have been unnecessary if ContentInspector and PolicySetManager were wired during their respective phases
2. Keep ROADMAP.md plan counts in sync with disk reality — stale checkboxes erode trust in the tracking system
3. Protobuf codegen compatibility matters — tonic-prost-build version pinning saved hours of debugging
4. Test with per-test CA isolation to prevent cross-test TLS state pollution
5. Regulatory policy seed packs (Rego files) are high-value, low-effort — 8 frameworks seeded in a single plan

### Cost Observations
- Model mix: primarily opus for implementation, haiku for verification agents
- Notable: Phase 3 plans averaged ~6.5 min each, demonstrating that well-scoped plans with clear success criteria execute fastest

---

## Milestone: v1.1 — Pilot Ready

**Shipped:** 2026-03-04
**Phases:** 9 | **Plans:** 24

### What Was Built
- API key auth with 5-role RBAC, department scoping, and dual-mode (API key + session token) authentication
- Docker Compose deployment with 8 services, cert-init automation, and health-based startup ordering
- Next.js compliance dashboard with 10+ views: policy builder, audit trail, vendors, regulatory, reports, evidence verification, review queue, department policies, anomalies, signing keys
- SAML 2.0 SSO with JIT provisioning, mTLS on all gRPC channels, Ed25519 key rotation with hot-reload
- Kubernetes Helm chart with KEP-753 sidecar injection, pilot/enterprise overlays, CA trust scripts
- Gap closure phases (13-15) for deployment wiring, cross-origin cookie fix, signing key dashboard UI

### What Worked
- Milestone audit after Phase 12 caught 2 integration gaps (ACS cross-origin cookie, missing signing key UI) — Phases 13-15 closed them cleanly
- BFF proxy pattern eliminated client-side token exposure from day one — zero security rework
- Wave-based parallelization within phases (especially Phase 11: 4 plans in parallel) kept velocity high
- Plan-check and verifier agents caught the DASH-06 BFF binary passthrough bug before it reached milestone audit
- Phase numbering continuation from v1.0 (7-15) prevented confusion across milestones

### What Was Inefficient
- SUMMARY frontmatter (one_liner, requirements_completed) never populated — 24 summaries missing these fields
- ROADMAP.md plan checkboxes inconsistently maintained — some phases show `[ ]` despite being complete
- STATE.md performance metrics table became manually maintained and drifted from reality
- Three gap-closure phases (13, 14, 15) could have been prevented with cross-phase integration testing earlier

### Patterns Established
- BFF proxy with httpOnly cookie for dashboard → API auth (no client-side tokens)
- Dual-mode auth middleware: `ik_live_*` prefix routes to API key flow, all else to session token
- SAML cross-origin callback redirect pattern (ACS → dashboard callback → cookie set on correct origin)
- TanStack Query + BFF proxy for all dashboard data fetching with optimistic updates
- cert-init service pattern (Docker Compose + Helm pre-install hook) for automated TLS bootstrap
- RotatingSigningProvider with ArcSwap for lock-free key hot-reload via file mtime polling

### Key Lessons
1. Cross-phase integration testing should happen mid-milestone, not only at audit — 3 gap-closure phases were preventable
2. SUMMARY frontmatter fields must be populated during execution, not deferred — empty fields degrade milestone audit quality
3. Helm cannot bake NEXT_PUBLIC_ env vars at deploy time — Next.js requires build-time injection; document this for operators
4. Department scoping must be designed into every new API module from the start, not retrofitted — reviews and anomalies missed it
5. Milestone audit with integration checker is high-value — caught real cross-phase wiring gaps that phase-level verification missed

### Cost Observations
- Model mix: opus for orchestration/implementation, sonnet for verifier/integration-checker, haiku for exploration
- 9 phases completed in ~3 days of wall clock time
- Notable: gap-closure phases (13-15) averaged 1-2 min per plan — fast because scope was narrow and well-defined

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 28 | Initial milestone — established GSD workflow with plan-check and verifier agents |
| v1.1 | 9 | 24 | Milestone audit + gap-closure phases; BFF proxy pattern; dual-mode auth; cert-init automation |

### Top Lessons (Verified Across Milestones)

1. Streaming-first design eliminates throwaway code — commit to production patterns from day one
2. Wire integration points in the same phase that builds the component, not retroactively
3. Small, well-scoped plans (2 tasks each) execute 3-8x faster than large plans
