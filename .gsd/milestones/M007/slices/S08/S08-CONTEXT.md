---
id: S08
milestone: M007
status: ready
---

# S08: Documentation, Accessibility & Polish — Context

## Goal

Complete all documentation gaps and bring dashboard accessibility to WCAG AA, then update all project tracking documents to reflect v1.5 completion.

## Why this Slice

This is the final slice — it documents the final state after all other changes land. The assessment found no deployment runbook, no API documentation, accessibility at C+, and several dashboard TypeScript errors. This slice closes every remaining gap.

## Scope

### In Scope

- **T01: Deployment runbook / operator guide** — `docs/OPERATOR-GUIDE.md`: production deployment checklist, air-gapped deployment, mTLS cert management/rotation, full_text_storage configuration, ProxyService safety notes, backup/restore procedures, monitoring/alerting setup, troubleshooting common issues
- **T02: API documentation** — OpenAPI/Swagger spec for control-plane REST endpoints, gRPC service documentation (buf or manual proto docs), host API docs as static page or in dashboard
- **T03: Troubleshooting guide** — `docs/TROUBLESHOOTING.md`: kernel startup failures, policy distribution issues, evidence chain verification failures, dashboard-to-control-plane connectivity, ClickHouse query timeouts, certificate expiration handling
- **T04: Dashboard accessibility improvements** — WCAG AA: ARIA labels on all interactive elements, skip navigation link, `aria-live` regions for audit feed and anomaly alerts, keyboard navigation (Tab, Enter, Escape), role attributes, axe-core validation with zero critical/serious violations
- **T05: Update project state and assessment** — update STATE.md, PROJECT.md, assessment scores, append M007 summary to planning roadmap

### Out of Scope

- New features or capabilities
- Dashboard redesign
- Automated documentation generation (manual is fine for this scope)

## Constraints

- Documentation must be accurate against the final state (after S01-S07 land)
- Accessibility changes must not break existing dashboard functionality
- axe-core must run in CI (integrate with Playwright or standalone)
- API docs must match the actual API (validate against running service)

## Integration Points

### Consumes

- All prior slices — documents the final state
- `control-plane/src/` — API routes for OpenAPI spec generation
- `proto/` — protobuf definitions for gRPC documentation
- `dashboard/` — all components for accessibility improvements
- `helm/interdict/` — Helm chart for deployment documentation
- `docker-compose.yml` — Compose config for deployment documentation

### Produces

- `docs/OPERATOR-GUIDE.md` — complete operator documentation
- `docs/openapi.yaml` — OpenAPI spec for control-plane
- `docs/TROUBLESHOOTING.md` — troubleshooting guide
- WCAG AA-compliant dashboard (ARIA labels, keyboard nav, skip navigation, live regions)
- Updated `.gsd/STATE.md`, `.gsd/PROJECT.md` reflecting v1.5 completion

## Open Questions

- OpenAPI generation — manual spec vs auto-generated from Elysia route definitions (Elysia may have built-in OpenAPI support)
- gRPC documentation format — buf-based generation vs markdown documentation of proto files
- axe-core CI integration — standalone CLI vs Playwright integration for accessibility testing
- Screen reader testing — axe-core catches structural issues but not real screen reader experience; may need manual verification
