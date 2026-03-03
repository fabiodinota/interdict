# Phase 9: Dashboard Core Views - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Visual dashboard where a compliance officer manages governance policies, reviews audit trails, manages AI vendors and regulatory jurisdictions, views real-time violation statistics, and generates compliance reports. This is a greenfield Next.js frontend consuming the existing control plane REST APIs (policies, vendors, regulatory, audit, compiler modules all built in prior phases). The dashboard replaces the static nginx placeholder from Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Frontend Stack
- Next.js App Router — same framework as the containerclaw dashboard reference project
- shadcn/ui + Tailwind CSS v4 — same component library and styling approach as containerclaw
- Bun as package manager (consistent with control plane)
- Dashboard runs as its own Next.js server process in the Docker stack (replaces the static nginx placeholder)

### Navigation & Layout
- Persistent left sidebar with icon + label links: Home, Policies, Audit Trail, Vendors, Regulatory, Reports — same pattern as containerclaw's Sidebar component
- Top bar for breadcrumbs/user info — same pattern as containerclaw's TopBar
- Sidebar collapsible for more screen space
- Layout structure: sidebar (fixed width) + main content area (flex), with Suspense-wrapped sidebar to avoid layout blocking

### Authentication
- Login page with API key input — user pastes their API key into a login form
- API key stored in cookie/session (httpOnly for security)
- Bearer token auth matching the existing control plane auth middleware
- No email/password flow — uses the existing API key auth system from Phase 7

### Visual Theme
- Dark + light + system toggle via next-themes — same approach as containerclaw
- CSS variables for theming, compatible with shadcn/ui
- Theme toggle in top bar or settings area

### Policy Builder (Hybrid Wizard Approach)
- Step 1: Pick category (vendor control, content inspection, rate limiting, custom)
- Step 2: Pick template within that category (pre-built policy templates)
- Step 3: Fill in parameters via form fields (dropdowns, toggles, text inputs) — system generates Rego behind the scenes
- Step 4: Optional visual rule editor to add/modify conditions — simple condition rows: [Field] [Operator] [Value] with AND/OR connectors (like email filter rules, not drag-and-drop blocks)
- Step 5: Preview generated Rego before submission
- Advanced users can toggle to raw Rego editor at any point
- Core governance template set (5-7 templates): Block vendor, PII detection/redact, Rate limit by department, Content length limit, Allowed model versions, Jurisdiction restrict
- Live compilation status tracking inline: "Compiling..." -> "Compiled" or "Error" with details; auto-poll the compilation-status endpoint until done

### Policy List & Versions
- Expandable row pattern: policy list shows current version, click to expand and see version history with diff view and restore button
- Keeps the list clean while providing full version access

### Dashboard Home Screen
- Top row: 4 KPI cards (total requests today, violations today, active policies, active vendors)
- Below: violation trend line chart + vendor usage bar chart with time range selector (24h / 7d / 30d)
- Live activity feed panel showing real-time audit events via SSE — similar to containerclaw's real-time PocketBase subscription pattern
- Hybrid refresh strategy: SSE for the activity feed (instant), 30-second polling for aggregated chart stats (ClickHouse queries are heavier)

### Charting
- Recharts library for all data visualization
- Manual refresh button + last-updated timestamp on chart panels

### Report Generation
- Server-side report generation via new control plane endpoint
- Client downloads the generated file (PDF or CSV)
- Comprehensive report content: executive summary, policy violations by type/department/vendor, audit trail highlights (top 10 incidents), active policies list, vendor approval status, regulatory framework compliance status, date range on every page
- Presets + custom date range: Last 7 days, Last 30 days, Last quarter, Year to date, plus custom date range picker
- Progress indicator (spinner/progress bar) during generation

### Claude's Discretion
- Exact component structure and file organization within the dashboard app
- State management approach (React Query, SWR, or plain hooks)
- Table component for audit trail (TanStack Table or shadcn DataTable)
- PDF generation library on the server (pdf-lib, jsPDF, or alternatives in Bun)
- CSV generation approach
- Loading skeletons and error states
- Exact spacing, typography scale, and color palette
- Audit trail search/filter UI layout
- Vendor management and regulatory framework selector UI details
- How the activity feed integrates with the chart layout on the home screen

</decisions>

<specifics>
## Specific Ideas

- Follow containerclaw dashboard patterns wherever applicable: sidebar layout, theme setup, Suspense boundaries, toast notifications (Sonner), component organization
- The "one-command experience" from Phase 8 means the dashboard must work out of the box with `docker compose up` — the dashboard Dockerfile needs to build the Next.js app and serve it
- Policy templates should be tailored for a law firm pilot: PII in legal documents, client confidentiality, jurisdiction-specific data handling
- The audit trail needs server-side pagination (API already supports cursor-based pagination)
- Vendor approve/block changes must reflect in kernel enforcement "within seconds" (success criterion 4) — the gRPC distribution server handles propagation, UI should show confirmation that the change propagated
- The visual rule editor (condition rows) should feel like building email filter rules — accessible to non-technical compliance officers

</specifics>

<code_context>
## Existing Code Insights

### Reference Project (containerclaw dashboard)
- `/Users/fabiodinota/Documents/containerclaw/dashboard/` — Next.js 16 + shadcn/ui + Tailwind v4 + next-themes
- Layout: `src/app/(dashboard)/layout.tsx` — sidebar + top bar + main content with Suspense
- Sidebar: `src/components/layout/Sidebar.tsx` — persistent left nav with icon + label links, role-based sections
- Auth: PocketBase-based but pattern of login page + session cookie translates to API key flow
- Real-time: PocketBase subscriptions for live updates — equivalent pattern for SSE in Interdict
- Theme: next-themes with system/dark/light toggle, CSS variables for all colors
- Toasts: Sonner at bottom-right with rich colors
- Components: shadcn/ui (New York style), Lucide icons, Radix primitives

### Control Plane APIs (consumers for dashboard)
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
- Dashboard currently served by nginx container (docker/dashboard/Dockerfile) — needs update for Next.js
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
*Context gathered: 2026-03-03*
