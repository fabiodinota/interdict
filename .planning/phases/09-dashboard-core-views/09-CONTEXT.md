# Phase 9: Dashboard Core Views - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Visual dashboard where a compliance officer manages governance policies, reviews audit trails, manages AI vendors and regulatory jurisdictions, views real-time violation statistics, and generates compliance reports. This is a greenfield React frontend consuming the existing control plane REST APIs (policies, vendors, regulatory, audit, compiler modules all built in prior phases). The dashboard replaces the static nginx placeholder from Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Frontend Stack
- React + Vite for the dashboard application
- shadcn/ui + Tailwind CSS for component library and styling
- Built static files served by the existing nginx container (replaces placeholder)
- Bun used as package manager and build tool (consistent with control plane)

### Navigation & Layout
- Persistent left sidebar navigation with icon + label links: Home, Policies, Audit Trail, Vendors, Regulatory, Reports
- Sidebar is collapsible for more screen space
- Standard admin dashboard layout pattern

### Authentication
- API key from env/config — dashboard reads the API key at runtime (injected via env var or config file)
- No login page needed for the pilot deployment (single-tenant law firm)
- Bearer token auth matching the existing control plane auth middleware

### Visual Theme
- Dark theme only — modern, professional look suitable for monitoring dashboards
- Colored charts on dark backgrounds for high contrast
- One theme done well rather than two done partially

### Policy Builder
- Template picker + form approach: pre-built policy templates, user picks a template and fills in parameters via form fields (dropdowns, toggles, text inputs), system generates Rego behind the scenes
- Advanced users can toggle to a raw Rego editor view
- Core governance template set (5-7 templates): Block vendor, PII detection/redact, Rate limit by department, Content length limit, Allowed model versions, Jurisdiction restrict
- Live compilation status tracking inline: "Compiling..." -> "Compiled" or "Error" with details; auto-poll the compilation-status endpoint until done

### Policy List & Versions
- Expandable row pattern: policy list shows current version, click to expand and see version history with diff view and restore button
- Keeps the list clean while providing full version access

### Dashboard Home Screen
- Top row: 4 KPI cards (total requests today, violations today, active policies, active vendors)
- Below: violation trend line chart + vendor usage bar chart
- Time range selector (24h / 7d / 30d)
- Clean, scannable layout focused on key metrics

### Charting
- Recharts library for all data visualization
- 30-second polling for auto-refresh with visual indicator showing last refresh time
- Manual refresh button available

### Report Generation
- Server-side report generation via new control plane endpoint
- Client downloads the generated file (PDF or CSV)
- Comprehensive report content: executive summary, policy violations by type/department/vendor, audit trail highlights (top 10 incidents), active policies list, vendor approval status, regulatory framework compliance status, date range on every page
- Presets + custom date range: Last 7 days, Last 30 days, Last quarter, Year to date, plus custom date range picker
- Progress indicator (spinner/progress bar) during generation

### Claude's Discretion
- Exact component structure and file organization within the dashboard app
- State management approach (React Query, Zustand, or plain useState/useContext)
- Routing library choice (React Router, TanStack Router)
- Table component for audit trail (TanStack Table or shadcn DataTable)
- PDF generation library on the server (PDFKit, Puppeteer, or alternatives available in Bun)
- CSV generation approach
- Loading skeletons and error states
- Exact spacing, typography scale, and color palette within dark theme
- Audit trail search/filter UI layout
- Vendor management and regulatory framework selector UI details

</decisions>

<specifics>
## Specific Ideas

- The "one-command experience" from Phase 8 means the dashboard must work out of the box with `docker compose up` — no separate build step for the user
- Policy templates should be tailored for a law firm pilot: PII in legal documents, client confidentiality, jurisdiction-specific data handling
- The audit trail needs server-side pagination (API already supports cursor-based pagination)
- Vendor approve/block changes must reflect in kernel enforcement "within seconds" (success criterion 4) — this is already handled by the gRPC distribution server, but the UI should show a confirmation that the change propagated

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `control-plane/src/modules/policies/index.ts`: Full CRUD + version history REST API (POST, GET, PUT, DELETE, versions, restore)
- `control-plane/src/modules/vendors/index.ts`: Vendor registry CRUD with per-model control
- `control-plane/src/modules/regulatory/index.ts`: Framework listing, activation/deactivation, policy toggle
- `control-plane/src/modules/audit/index.ts`: Search with filters, SSE streaming, hourly violations, vendor usage, department summary stats
- `control-plane/src/modules/compiler/index.ts`: Compilation status endpoint for policies
- `control-plane/src/modules/auth/middleware.ts`: Bearer token auth macro — dashboard uses same auth pattern
- `control-plane/src/shared/utilities.ts`: `apiResponse()` and `paginatedResponse()` wrappers — dashboard should expect this response shape

### Established Patterns
- All API responses wrapped in `{ success: true, data: ... }` via `apiResponse()`
- Paginated responses use cursor-based pagination with `{ items: [], nextCursor: string | null }`
- Auth uses Bearer token in Authorization header
- Role hierarchy: read_only_auditor < policy_admin < super_admin
- Elysia validation errors return 400 with `VALIDATION_ERROR` code

### Integration Points
- Dashboard served by nginx container (docker/dashboard/Dockerfile) — need to replace static placeholder with built React app
- Control plane API at port 3000 (exposed to host in docker-compose.yml)
- SSE endpoint at /api/v1/audit/stream for real-time events
- Policy compilation is asynchronous — poll /api/v1/policies/:id/compilation-status

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-dashboard-core-views*
*Context gathered: 2026-03-02*
