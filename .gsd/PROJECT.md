# Interdict.io

## What This Is

Interdict.io is a kernel-level AI governance and compliance platform for regulated enterprises. It sits as an intercepting infrastructure layer between a company's internal users and every AI tool they use (ChatGPT, Copilot, Anthropic, internal agents, etc.), enforcing configurable policies inline in real time, producing cryptographically signed tamper-proof audit trails, and mapping every AI action to regulatory frameworks (EU AI Act, GDPR, NIST AI RMF, etc.). It deploys inside the customer's own infrastructure (VPC-native) — data never leaves their perimeter.

A CISO can log in via SAML SSO, configure policies through a visual dashboard, review audit trails, generate compliance reports, and manage vendor approvals. IT can deploy the full stack via Docker Compose or Helm chart.

## Core Value

Every AI action an employee takes is routed through a policy-enforcing kernel — logged, signed, and regulatorily mapped — before it reaches any model. Inline prevention, not post-hoc reporting.

## Requirements

### Validated

**Data Plane (Rust Kernel) — v1.0**
- ✓ Rust-based transparent proxy intercepting all outbound AI traffic (HTTP/1.1, HTTP/2, SSE, gRPC, WebSockets) — v1.0
- ✓ Streaming response inspection via sliding window token buffer — v1.0
- ✓ Mid-stream connection severing with redaction replacement — v1.0
- ✓ Fail-Closed / Fail-Open toggle as per-policy configuration — v1.0
- ✓ Embedded Wasmtime runtime for policy modules — v1.0
- ✓ 3-layer policy pipeline: Wasm/Rego (<2ms) → NLP classifier (<10ms) → async human review — v1.0
- ✓ Hot-reload of Wasm policy modules without kernel restart — v1.0
- ✓ Session context tracking across multi-turn conversations — v1.0
- ✓ Asynchronous evidence bundle creation with background flush — v1.0
- ✓ gRPC channel from kernel to evidence collector — v1.0
- ✓ <10ms p99 latency overhead, >10k RPS per instance, <128MB RAM — v1.0
- ✓ Vendor allowlist enforcement — v1.0

**Cryptographic Audit Pipeline — v1.0**
- ✓ SHA-256 linked hash chains on all evidence bundles — v1.0
- ✓ Ed25519 digital signatures on every evidence bundle — v1.0
- ✓ Merkle tree construction for hourly root hash batches — v1.0
- ✓ External anchoring to S3 Object Lock (WORM) — v1.0

**Control Plane API — v1.0**
- ✓ Policy CRUD, Rego-to-Wasm compiler, vendor registry — v1.0
- ✓ gRPC push-based policy distribution with real-time hot-reload — v1.0
- ✓ 8 regulatory framework packs (EU AI Act, GDPR, NIST, PDPA, DPDP, China, Canada, GCC) — v1.0
- ✓ Audit trail query API with ClickHouse — v1.0

**Identity & Security — v1.1**
- ✓ SAML 2.0 SSO with enterprise IdPs (Okta, Azure AD) — v1.1
- ✓ API key authentication for programmatic access — v1.1
- ✓ 5-role RBAC (Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor) — v1.1
- ✓ Department-scoped data access for Department Managers — v1.1
- ✓ mTLS between all internal components — v1.1
- ✓ Ed25519 signing key rotation without breaking prior verification — v1.1

**Dashboard — v1.1**
- ✓ Policy Builder UI (no Rego knowledge required) — v1.1
- ✓ Audit Trail with search/filter and server-side pagination — v1.1
- ✓ Real-time violation statistics with auto-refresh — v1.1
- ✓ Vendor Management with approve/block and model allowlists — v1.1
- ✓ Regulatory Framework Selector — v1.1
- ✓ PDF/CSV compliance report generation — v1.1
- ✓ Evidence Verification UI (hash chain, Ed25519 signature) — v1.1
- ✓ Human Review Queue with SLA timers — v1.1
- ✓ Department Policy Management with overrides — v1.1
- ✓ Anomaly Detection alerts — v1.1

**Deployment — v1.1**
- ✓ Container images for all services — v1.1
- ✓ Docker Compose one-command deployment — v1.1
- ✓ Kubernetes Helm chart with configurable values — v1.1
- ✓ Kernel sidecar deployment (KEP-753) — v1.1
- ✓ CA certificate trust scripts (macOS, Windows, Linux) — v1.1

**Trustworthiness & Hardening — v1.2**
- ✓ Evidence verification is internally consistent across all verification surfaces — v1.2
- ✓ Auth bootstrap no longer persists raw bearer credentials — v1.2
- ✓ JS/TS correctness is enforced in CI — v1.2
- ✓ Reporting and policy-scope behavior are honest and complete — v1.2
- ✓ Evidence attribution and durability match audit expectations — v1.2
- ✓ Review workflow architecture has one source of truth — v1.2
- ✓ Core kernel and control-plane change hotspots have been reduced — v1.2
- ✓ Dashboard trust-sensitive workflows are automated and verified — v1.2
- ✓ Deployment artifacts and docs no longer overclaim production readiness — v1.2
- ✓ Final product language matches what the platform can actually prove — v1.2

**Production Readiness — v1.5**
- ✓ Hot-path relay test coverage: 11 unit + 1 integration test across relay/streaming_relay/tls (32 total hot-path unit tests, 88 integration tests) — v1.5
- ✓ Layer 3 queue and evidence signing tests: 17 new tests covering cleanup_old(), get_pending(), key loading, KMS mock signing, key rotation, error propagation (22 queue/store + 31 signing/chain tests) — v1.5
- ✓ Dependency cleanup and workspace lints: cargo-deny supply-chain gate, workspace clippy lints, rand_core 0.6 compatibility — v1.5
- ✓ Expanded test coverage: 46 dashboard test files (370 test cases), 26 control-plane test files (308 tests), Playwright E2E smoke test, vitest coverage thresholds (60/50/55/60), CI coverage gate hardened to blocking — v1.5
- ✓ CI/CD release pipeline: GitHub Actions release workflow on v* tag, 4 Docker images to ghcr.io, SPDX SBOMs via anchore/sbom-action, cosign keyless OIDC signing by digest, release-please automation, commitlint with husky, TruffleHog secret scanning, criterion benchmark tracking — v1.5
- ✓ CSP nonce hardening: per-request nonce middleware replacing unsafe-inline, strict-dynamic for scripts, inline styles refactored to Tailwind, zero unsafe-inline in production — v1.5
- ✓ Helm network policies: enabled by default for all 4 services with CNI documentation — v1.5
- ✓ DevOps maturity: multi-platform Docker builds (amd64+arm64), .dockerignore allowlist pattern, startupProbe on all Helm deployments, json-file log rotation on all Compose services, Prometheus+Grafana monitoring profile, backup script (Postgres + ClickHouse), validate-env.sh pre-flight checks, kube-score CI integration — v1.5
- ✓ Operator documentation: 578-line operator guide, 417-line troubleshooting reference, full-text-storage security guide — v1.5
- ✓ API documentation: REST reference (53 endpoints, 13 modules), gRPC reference (2 proto services) — v1.5
- ✓ WCAG AA accessibility: aria-label on all icon buttons, vitest-axe assertions on 6 components, @axe-core/playwright WCAG AA check in Playwright smoke test — v1.5

### Out of Scope

- **Building/fine-tuning LLMs** — governance infrastructure, not a model provider
- **eBPF-based syscall interception** — future capability, requires deep Linux kernel expertise
- **TEE / Hardware-backed secure enclaves** — high value but not needed for initial pilots
- **Zero-Knowledge Proofs** — proof generation too slow, regulators haven't asked for it
- **LLM-based inline policy enforcement** — explicitly prohibited; non-deterministic
- **Blockchain for auditability** — Merkle tree with S3 WORM achieves same guarantees at lower complexity
- **Shadow AI / network-level interception** — deferred; v1 works as opt-in proxy
- **Air-gapped deployment mode** — OPA download isolated for offline replacement (Phase 23); full air-gapped not yet demonstrated end-to-end
- **OIDC authentication** — SAML covers both pilot targets; OIDC is fast-follow
- **SCIM user provisioning** — 80-user pilot = manual management acceptable
- **Custom dashboard widgets** — ship fixed layout first
- **Dark mode** — doubles CSS maintenance; one polished light theme
- **Kubernetes Operator** — Helm chart suffices for 2-pilot scope
- **Real-time WebSocket streaming dashboard** — polling with 30s refresh suffices

## Context

**M008 S07 (Code Quality & Dashboard Fixes) complete 2026-03-15.** Seven low-severity code quality findings addressed across dashboard, control-plane, and Rust CLI. Removed dead `document.cookie` httpOnly clearing from auth-client.ts logout(). Made cookie `secure` flag configurable via `COOKIE_SECURE` env var with NODE_ENV fallback (D057). Sanitized RouteError.tsx console.error for production (generic message only, full error in dev). Replaced `as any` with `as unknown as number` in audit-table.test.tsx. Added ClickHouse empty-password production warning in config.ts. Replaced interdict-verify `.unwrap()` with `.unwrap_or_else()` fallback. Added CSRF Protection documentation to operator guide. 1 decision (D057). AR-CODE-01 validated.

**M008 S06 (Cross-Service Integration Tests) complete 2026-03-15.** Created docker-compose.test.yml override with ephemeral test-prefixed volumes, ports remapped to 1xxxx range, deterministic dev credentials, dashboard excluded. Orchestration script (scripts/integration-test.sh) auto-discovers tests/integration/*.sh, runs sequentially with per-test pass/fail tracking, trap-based cleanup dumps logs on failure. Policy distribution test proves 8-step lifecycle: auth bootstrap via direct psql insert (D056), REST policy creation, OPA compilation polling, kernel gRPC distribution receipt, allowlist enforcement (403 on non-allowlisted domain), cleanup. Evidence pipeline test proves 8-step flow: baseline ClickHouse count, kernel CONNECT requests, ClickHouse flush polling, field verification (bundle_id, kernel_id, vendor, policy_action, timestamp), chain hash integrity, audit API queryability. 1202 lines across 4 new files. 2 decisions (D055–D056). AR-TEST-01 validated.

**M008 S05 (Helm Security Hardening) complete 2026-03-15.** Cert-init Job hardened with full pod-level and container-level securityContext (runAsNonRoot, runAsUser/Group 1000, readOnlyRootFilesystem, capabilities drop ALL, seccompProfile RuntimeDefault). Used `apk --root /tmp/apkroot` technique to install openssl to tmpfs while preserving read-only rootfs. Sidecar template changed to readOnlyRootFilesystem: true with tmpfs for /tmp, added missing runAsGroup and capabilities drop ALL. Created ServiceAccount with automountServiceAccountToken: false, namespace-scoped Role for secrets+configmaps get/list, and RoleBinding. All 6 pod specs wired to SA. Fixed CRLF line endings in 14 Helm template files that caused silent grep verification failures. 2 decisions (D053–D054). AR-HELM-01 validated.

**M008 S04 (Docker Compose & Monitoring Hardening) complete 2026-03-15.** Added 3-network segmentation to Docker Compose: frontend (browser-facing), backend (inter-service), data (database). Dashboard isolated from data tier. Grafana credentials parameterized with fail-closed :? syntax (compose refuses to start without GRAFANA_ADMIN_PASSWORD). Resource limits on all 9 services (4 app + 3 infra + 2 monitoring). Operator guide updated with v1.6 upgrade section covering network topology diagram, credential migration, and resource limits table. 1 decision (D052). AR-INFRA-01 validated.

**M008 S03 (Input Validation & Output Sanitization) complete 2026-03-15.** CSV formula injection defense added to escapeCSV() — neutralizes =, +, -, @ prefixes with single-quote prepend (OWASP standard). Added maxLength constraints to all 47 TypeBox string fields across 7 model files using semantic tiers (255 for IDs, 500 for names, 2000 for URLs, 5000 for notes, 10000 for descriptions, 500000 for rego_source). Configured dual-layer body size limit: onRequest Content-Length check with structured 413 JSON response + Bun maxRequestBodySize backstop, 1MB default via MAX_BODY_SIZE env var. 45 new tests (21 CSV + 21 maxLength + 3 body limit). AR-INPUT-01 validated. 1 new decision (D051).

**M008 S02 (Auth Hardening) complete 2026-03-15.** Per-route rate limiting on auth endpoints (10/min per IP, sliding window, TTL eviction). Interval-based session/handoff cleanup (5-min default, 1000 batch). 32 SAML tests + 12 rate limit tests + 11 cleanup tests. 4 decisions (D047–D048). AR-AUTH-01, AR-AUTH-02, AR-AUTH-03 validated.

**M008 S01 (CI Supply Chain Hardening) complete 2026-03-15.** Pinned all 45 GitHub Actions references to SHA digests across 3 workflow files (30+14+1), eliminating cosign-installer@main and trufflehog@main as highest-risk mutable refs. Replaced OPA binary ADD with curl + SHA256 checksum verification for both amd64 and arm64. Pinned all 8 Docker base image FROM lines by manifest-list digest. Removed x86_64-pc-windows-msvc from deny.toml targets. Renovate pinDigests:true configured for automated updates. 3 decisions (D044–D046). AR-SUPPLY-01 validated.

**M007 (Production Readiness v1.5) COMPLETE 2026-03-15.** All 8 slices delivered across a single day. 17 decisions (D027–D043). 12 new requirements validated (PR-TEST-01 through PR-A11Y-01). Total test suite: 32 hot-path unit + 88 integration + 370 dashboard + 308 control-plane tests. Complete CI/CD release pipeline with cosign-signed images. CSP nonce-hardened dashboard with WCAG AA accessibility. Multi-platform Docker builds, monitoring stack, backup scripts, environment validation. Full documentation suite: operator guide, troubleshooting reference, REST API (53 endpoints), gRPC API (2 services). Project is at v1.5 Production Readiness — all 7 milestones complete, ready for GA release.

**M007 S08 (Documentation, Accessibility & Polish) complete 2026-03-15.** Added WCAG AA accessibility to dashboard: aria-label on 4 icon buttons (3 planned + 1 discovered), vitest-axe assertions on 6 component tests, @axe-core/playwright WCAG AA check in Playwright smoke test. Created 578-line operator guide and 417-line troubleshooting reference. Created REST API reference (53 endpoints, 13 modules) and gRPC API reference (2 proto services). Updated PROJECT.md to v1.5, README.md with documentation links, STATE.md with M007 complete.

**M007 S07 (DevOps & Deployment Maturity) complete 2026-03-15.** Hardened .dockerignore with ~25 exclusions + 7 allowlist entries. Added multi-platform Docker builds (amd64+arm64) via QEMU for all 4 services. Control-plane Dockerfile uses TARGETARCH for OPA binary. Added startupProbe to all 4 Helm deployments (150s window). kube-score v1.18.0 integrated in CI infra-quality job and local infra-check.sh with 13 ignore flags for bitnami subchart issues. All 9 Docker Compose services have json-file log rotation (10m×3). Created Prometheus+Grafana monitoring profile overlay. Created backup script (Postgres pg_dump + ClickHouse table-by-table, --dry-run). Created validate-env.sh pre-flight script catching CHANGE_ME placeholders, missing vars, malformed URLs — wired into smoke-test.sh. 5 decisions (D037–D041).

**M007 S06 (Security & CSP Hardening) complete 2026-03-15.** Replaced unsafe-inline CSP with per-request nonce-based middleware in proxy.ts (Next.js 16 pattern). script-src uses 'nonce-{n}' + 'strict-dynamic', style-src uses 'nonce-{n}' — zero unsafe-inline in production. Refactored Sonner and VendorUsageChart inline styles to Tailwind classes. Enabled Helm NetworkPolicy by default for all 4 services with CNI documentation. Added tracing::warn! at startup in kernel and evidence-collector when full_text_storage is enabled. Created 163-line operator guide at docs/operator/full-text-storage.md covering security, GDPR, and configuration. 17 middleware tests pass. 2 decisions (D035–D036).

**M007 S05 (CI/CD Release Pipeline + Quality Gates) complete 2026-03-15.** Created complete release pipeline: `.github/workflows/release.yml` triggered on `v*` tag push builds 4 Docker images (kernel, control-plane, dashboard, evidence-collector), pushes to ghcr.io, generates SPDX SBOMs via anchore/sbom-action, signs each by digest via cosign keyless OIDC, and creates GitHub Release with auto-notes and SBOM assets. Added release-please automation for version bumps/changelog/tag creation. Commitlint enforces conventional commits via husky hook and CI job. TruffleHog secret scanning blocks on verified/unknown findings. Criterion benchmark tracking with 200% alert threshold on main-only. CODEOWNERS and PR template for review governance. 4 new decisions (D031–D034).

**M007 S04 (Expanded Test Coverage) complete 2026-03-15.** Dashboard test coverage expanded from 8→46 component test files (370 test cases, 0 failures) via 38 new vitest files covering all presentational, stateful, chart, table, form, dialog, and wizard components. Control-plane expanded from 18→26 test files (308 pass) with new coverage for anomaly severity, ClickHouse query builders, kernel tracker, auth middleware, CSV/PDF generators, cursor encoding, and config validation. Playwright E2E smoke test created with 3 test cases. Vitest coverage thresholds set (60/50/55/60). CI coverage job hardened from advisory to blocking gate. 2 new decisions (D029–D030).

**M007 S02 (Layer 3 Queue + Evidence Signing Tests) complete 2026-03-15.** Added 17 new tests (3 store, 14 evidence-collector) covering cleanup_old() semantics, get_pending() ordering, from_file() key loading (raw/PEM/error), KMS trait-boundary mock signing, key rotation reload, and sign_bundle error propagation. All untested code paths in queue/store and evidence signing now covered. 22 kernel queue/store tests pass, 31 evidence-collector signing/chain tests pass.

**M007 S01 (Hot-Path Relay Testing) complete 2026-03-15.** Added 11 unit tests and 1 integration test across relay.rs (flush-timeout, read/write error, outbound redaction), streaming_relay.rs (partial-match boundary-split, multi-redaction, channel-drop), and tls.rs (load_ca valid/missing/invalid PEM, concurrent cache). Integration test proves PII redaction through full CONNECT tunnel. Total hot-path unit tests: 32 (was 21). 88 integration tests pass. Established ErrorReader/ErrorWriter and echo backend test patterns for downstream slices.

**M006 (Production Safety & Quality) complete 2026-03-13.** 3 slices across 3 sessions. Eliminated all runtime panic paths in hot-path pattern initialization (14 Regex unwraps → LazyLock, InjectionDetector infallible, regorus fail-mode verdict). Added cargo-deny supply-chain gate, hardened all 4 Docker images (non-root, read-only rootfs, no-new-privileges), parameterized docker-compose credentials, added proptest PII fuzzing, CI coverage reporting, CONTRIBUTING.md/CHANGELOG.md, and workspace [lints]. 2 new decisions (D024–D025).

**M005 (Hardening & Release Readiness) complete 2026-03-12.** 4 slices across 4 sessions. Eliminated credential leak paths (seed plaintext reveal removed, API-key-to-session exchange for BFF cookies), made kernel mTLS distribution hostname deployment-configurable, established canonical repo-root quality gates with CI infra-quality job and Husky-based local hooks, and burned down warning debt (Biome for control-plane, Next.js 15→16 upgrade, Dockerfile and proto lint fixes). All 4 HR-* requirements validated.

**M004 (Scan Remediation) complete 2026-03-12.** 5 slices across 5 sessions. Systematic remediation of codebase scan findings: panic-free Rust with fallible constructors and async-safe mutexes, type-safe TypeScript across all 11 control-plane modules, fail-closed auth configuration, zero silent error swallowing, and deployment config parity with healthchecks and resource limits.

**M003 (v1.2 Trustworthiness & Hardening) complete 2026-03-12.** 9 slices across 9 sessions. Systematic trust audit: evidence verification consistency, auth secret hardening, reporting honesty, identity attribution, durable delivery, review workflow consolidation, typed maintainability, dashboard test coverage (0→62 tests), deployment artifact hardening, and Kubernetes security controls (NetworkPolicy, PDB, HPA). 8 new architectural decisions (D016–D023). All 10 v1.2 requirements validated.

**v1.1 shipped 2026-03-04.** Full platform operational: Rust kernel + evidence pipeline + control plane API + Next.js dashboard + Docker Compose + Helm chart. ~61,000 LOC across Rust, TypeScript, and Helm. 16 phases, 52 plans across 2 milestones. 21/21 v1.1 requirements satisfied.

**Pilot partners:** Boutique law firm (~80 employees, Docker Compose) and small private bank (Kubernetes/Helm) — both interested, discussions scheduled for March 2026.

**Architecture:** Strict Data Plane (Rust, hot path) / Control Plane (Bun/Elysia API + Next.js dashboard) separation. Zero cross-plane contamination through all milestones.

**Tech stack:** Rust (tokio, hyper, tonic, wasmtime, regorus), Bun + Elysia (API), Next.js + React (dashboard), PostgreSQL (config), ClickHouse (audit logs), protobuf/gRPC (internal comms).

## Constraints

- **Data Plane language**: Rust only
- **Latency budget**: <10ms p99 overhead in the kernel
- **Resource limits**: Kernel sidecar <128MB RAM steady state
- **No LLM in enforcement path**: deterministic methods only
- **VPC-native**: all data stays inside customer perimeter
- **Monorepo**: both planes in this repository

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rust for Data Plane | Memory safety, zero-copy I/O, sub-ms latency | ✓ Good — 20k+ LOC, <10ms p99 |
| Bun + Elysia for Control Plane API | TypeScript across full stack, Bun speed | ✓ Good — 13 modules operational |
| Next.js + React for dashboard | SSR-capable, enterprise ecosystem | ✓ Good — 10+ views shipped |
| Postgres + ClickHouse split | Config vs audit log performance | ✓ Good — clean separation |
| Wasmtime for policy execution | CNCF-backed, Rust-native, hot-reloadable | ✓ Good — pooling allocator + ArcSwap |
| Ed25519 for evidence signing | Fast, small signatures | ✓ Good — signing + rotation operational |
| Streaming-first inspection | No throwaway code | ✓ Good — zero rework |
| Docker Compose + Helm chart | Both deployment patterns for pilots | ✓ Good — both operational |
| 3-layer policy pipeline | Deterministic first, escalate edge cases | ✓ Good — L1+L2+L3 implemented |
| gRPC push for policy distribution | Real-time updates, no polling | ✓ Good — xDS-style streaming |
| BFF proxy pattern for dashboard | httpOnly cookie auth, no client-side tokens | ✓ Good — secure by default |
| SAML cross-origin callback redirect | Avoids cross-origin cookie loss | ✓ Good — Phase 14 fix |
| ECDSA P-256 for internal CA | Broader TLS library compatibility than Ed25519 | ✓ Good — mTLS operational |
| ArcSwap for signing key hot-reload | Lock-free atomic swaps, no restart needed | ✓ Good — 30s poll cycle |
| KEP-753 native sidecar pattern | Kubernetes-native lifecycle management | ✓ Good — initContainer with restartPolicy |
| Evidence signature payload = protobuf with zeroed chain/sig fields | Canonical signed payload format | ✓ Good — cross-language consistency |
| Postgres single authoritative review store | One source of truth for workflow state | ✓ Good — eliminated dual-write |
| Air-gapped OPA multi-stage Dockerfile | Offline-compatible deployment | ✓ Good — single stage replacement |
| Opt-in Helm security templates (NetworkPolicy, PDB, HPA) | No breaking changes to existing deployments | ✓ Good — disabled by default |
| rand_core 0.6 for ed25519-dalek compat (D024) | rand 0.9 traits incompatible with ed25519-dalek 2.x | ✓ Good — clean dependency graph |
| Workspace lints: clippy::all + suspicious (D025) | Codifies lint policy previously enforced only by CI flag | ✓ Good — workspace-wide consistency |

---
*Last updated: 2026-03-15 after completing M008/S07 (Code Quality & Dashboard Fixes) — M008 S01–S07 complete, S08 next (final slice)*
