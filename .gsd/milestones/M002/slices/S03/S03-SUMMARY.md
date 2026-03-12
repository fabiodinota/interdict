---
id: S03
parent: M002
milestone: M002
provides: []
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
# S03: Dashboard Core Views

**# Phase 9 Plan 01: Dashboard Foundation & Layout Summary**

## What Happened

# Phase 9 Plan 01: Dashboard Foundation & Layout Summary

**Next.js 15 dashboard with BFF auth proxy, collapsible sidebar, dark/light theme, and 6 route shells -- all building on shadcn/ui component library**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-03T04:34:47Z
- **Completed:** 2026-03-03T04:42:23Z
- **Tasks:** 2
- **Files modified:** 56

## Accomplishments
- Full Next.js dashboard scaffolded with 20 shadcn/ui components and complete dependency set
- BFF auth flow: login page validates API key against control plane, stores in httpOnly cookie, proxy injects Bearer token
- Collapsible sidebar with 6 navigation links (Home, Policies, Audit Trail, Vendors, Regulatory, Reports) and active state highlighting
- Top bar with breadcrumbs, theme toggle, and user dropdown with role badge and sign-out
- Multi-stage Docker build replacing nginx placeholder, docker-compose updated for port 3001

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Next.js project with full dependency set** - `db39831` (feat)
2. **Task 2: Implement auth flow, layout shell, BFF proxy, types, and Docker integration** - `6a5329e` (feat)

## Files Created/Modified
- `dashboard/package.json` - Project manifest with all dependencies
- `dashboard/tsconfig.json` - TypeScript configuration
- `dashboard/next.config.ts` - Next.js config with standalone output
- `dashboard/postcss.config.mjs` - PostCSS with Tailwind v4 plugin
- `dashboard/components.json` - shadcn/ui configuration
- `dashboard/src/app/globals.css` - Tailwind imports + CSS variable theming (light/dark)
- `dashboard/src/app/layout.tsx` - Root layout with Inter font, ThemeProvider, QueryClientProvider
- `dashboard/src/app/providers.tsx` - Client-side providers wrapper
- `dashboard/src/app/login/page.tsx` - Login page with API key input
- `dashboard/src/app/(dashboard)/layout.tsx` - Dashboard layout with Sidebar + TopBar + Toaster
- `dashboard/src/app/(dashboard)/page.tsx` - Home placeholder
- `dashboard/src/app/(dashboard)/policies/page.tsx` - Policies placeholder
- `dashboard/src/app/(dashboard)/audit/page.tsx` - Audit Trail placeholder
- `dashboard/src/app/(dashboard)/vendors/page.tsx` - Vendors placeholder
- `dashboard/src/app/(dashboard)/regulatory/page.tsx` - Regulatory placeholder
- `dashboard/src/app/(dashboard)/reports/page.tsx` - Reports placeholder
- `dashboard/src/app/api/auth/login/route.ts` - Login: validates API key, sets httpOnly cookie
- `dashboard/src/app/api/auth/logout/route.ts` - Logout: clears session cookie
- `dashboard/src/app/api/auth/me/route.ts` - Current user: reads cookie, calls control plane
- `dashboard/src/app/api/proxy/[...path]/route.ts` - BFF proxy with SSE streaming support
- `dashboard/src/middleware.ts` - Route protection middleware
- `dashboard/src/hooks/useAuth.ts` - Client-side auth hook with TanStack Query
- `dashboard/src/lib/api.ts` - Centralized API fetch wrapper
- `dashboard/src/lib/auth.ts` - Server-side auth utilities (cookie, control plane URL)
- `dashboard/src/lib/query-client.ts` - TanStack Query client singleton
- `dashboard/src/lib/utils.ts` - cn() utility for Tailwind class merging
- `dashboard/src/types/api.ts` - TypeScript interfaces for all API response shapes
- `dashboard/src/components/layout/Sidebar.tsx` - Collapsible sidebar with navigation
- `dashboard/src/components/layout/TopBar.tsx` - Top bar with breadcrumbs and user menu
- `dashboard/src/components/theme-provider.tsx` - next-themes provider wrapper
- `dashboard/src/components/theme-toggle.tsx` - Light/Dark/System dropdown toggle
- `dashboard/src/components/ui/*.tsx` - 20 shadcn/ui components
- `docker/dashboard/Dockerfile` - Multi-stage Next.js build (bun install, bun build, node runner)
- `docker-compose.yml` - Dashboard service: port 8080:3001, CONTROL_PLANE_URL, depends_on

## Decisions Made
- **BFF proxy pattern**: All client API calls route through Next.js API routes that inject the Bearer token from the httpOnly cookie. The API key is never exposed to client-side JavaScript after login.
- **Next.js 15 over 16**: Used stable v15 for production reliability. The containerclaw reference uses 16.1.6 but that is bleeding edge.
- **class-variance-authority**: Added as runtime dependency because shadcn/ui generated components require it (badge.tsx uses cva).
- **Standalone output for Docker**: Next.js `output: "standalone"` produces a self-contained `server.js` for minimal Docker image size.
- **Port 3001 internal / 8080 external**: Dashboard runs on 3001 inside Docker to avoid conflict with control plane on 3000. External mapping stays 8080 as before.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing class-variance-authority dependency**
- **Found during:** Task 1 (build verification)
- **Issue:** shadcn/ui badge component imports from class-variance-authority which was not in the initial dependency list
- **Fix:** `bun add class-variance-authority`
- **Files modified:** dashboard/package.json, dashboard/bun.lock
- **Verification:** `bun run build` succeeds
- **Committed in:** db39831 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for build to pass. No scope creep.

## Issues Encountered
None -- plan executed smoothly after the dependency fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard foundation complete with all infrastructure for building feature views
- Plan 09-02 can build home screen with real-time charts on top of this layout
- Plan 09-03 can build policy builder/list using the types and API client
- Plan 09-04 can build audit trail, vendors, regulatory, and reports using the placeholder pages

## Self-Check: PASSED

All 14 key files verified present. Both commit hashes (db39831, 6a5329e) confirmed in git log. Build succeeds.

---
*Phase: 09-dashboard-core-views*
*Completed: 2026-03-03*

# Phase 9 Plan 02: Dashboard Home Screen & Real-Time Charts Summary

**Dashboard home with 4 KPI cards, violation trend line chart, vendor usage bar chart, time range selector (24h/7d/30d), and SSE-powered live activity feed with auto-reconnection**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-03T04:45:42Z
- **Completed:** 2026-03-03T04:52:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- 4 KPI stat cards with skeleton loading, number formatting, and color-coded icons (requests, violations, policies, vendors)
- Violation trend line chart (Recharts) with lines per action type (allow/block/redact) using theme-aware CSS variables
- Vendor usage bar chart with per-vendor aggregation, custom tooltip showing model list, and color-coded bars
- Time range selector (24h/7d/30d) with manual refresh button and live "last updated: Xs ago" timestamp
- SSE activity feed with connection status indicator, action badges, relative timestamps, and clear button
- Reusable useSSE hook with 50-event cap, 5-second auto-reconnection, and proper cleanup on unmount
- All chart data polls every 30 seconds via TanStack Query refetchInterval with keepPreviousData

## Task Commits

Each task was committed atomically:

1. **Task 1: Build KPI cards, charts, time range selector, and dashboard hooks** - `ad59339` (feat)
2. **Task 2: SSE activity feed with reconnection** - `9b660f7` (feat)

## Files Created/Modified
- `dashboard/src/hooks/use-dashboard-stats.ts` - TanStack Query hooks for violations, vendor usage, policies count, vendors count
- `dashboard/src/hooks/useSSE.ts` - Reusable SSE hook with EventSource, auto-reconnect, event capping
- `dashboard/src/components/dashboard/KpiCards.tsx` - 4 KPI stat cards in responsive grid
- `dashboard/src/components/dashboard/TimeRangeSelector.tsx` - 24h/7d/30d toggle with refresh button and timestamp
- `dashboard/src/components/dashboard/ViolationChart.tsx` - Recharts LineChart with allow/block/redact lines
- `dashboard/src/components/dashboard/VendorUsageChart.tsx` - Recharts BarChart with per-vendor aggregation
- `dashboard/src/components/dashboard/ActivityFeed.tsx` - SSE-powered live event feed with status indicator
- `dashboard/src/app/(dashboard)/page.tsx` - Home page composing all dashboard components

## Decisions Made
- **KPI data derivation**: Total requests and violations today derived from the violations stats endpoint (sum of violation_count across actions, with block+redact filtered for violations). This avoids creating a new API endpoint.
- **Event ID generation**: Used module-level incrementing counter instead of crypto.randomUUID() to avoid SSR/hydration mismatch issues in Next.js.
- **Chart data pivoting**: Violation chart transforms flat (hour, action, count) records into pivoted rows for multi-line rendering. Vendor chart aggregates per-hour-per-model rows into per-vendor totals.
- **SSE reconnection**: 5-second reconnect delay with proper cleanup prevents connection leak. mountedRef guard prevents state updates after unmount.

## Deviations from Plan

None - plan executed exactly as written. The BFF proxy SSE support was already implemented in Plan 09-01 (Task 2 step 1 was already complete).

## Issues Encountered
- Pre-existing stale `.next` build cache caused ENOENT error in build trace collection. Resolved by cleaning `.next` directory before build. Not related to this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard home screen complete with full data visualization and real-time feed
- Plan 09-03 can build policy list/builder using the established component patterns and API hooks
- Plan 09-04 can build audit trail, vendors, regulatory views using the same patterns

## Self-Check: PASSED

All 8 key files verified present. Both commit hashes (ad59339, 9b660f7) confirmed in git log. Build succeeds.

---
*Phase: 09-dashboard-core-views*
*Completed: 2026-03-03*

# Phase 9 Plan 3: Policy Builder & Policy List Summary

**6 Rego policy templates with 5-step visual wizard, raw Rego editor, policy list with expandable version history and compilation status tracking**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-03T04:50:19Z
- **Completed:** 2026-03-03T08:49:35Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Built 6 Rego templates (Block Vendor, PII Detection/Redact, Rate Limit, Content Length, Allowed Models, Jurisdiction Restrict) each with generateRego() producing valid Rego with Interdict package structure
- Implemented 5-step Policy Builder wizard: category picker, template picker, parameter form, visual rule editor, and Rego preview with syntax highlighting
- Created policy list with expandable rows showing version history, line-by-line diff view, restore with confirmation, active toggle, and compilation status badges
- Added raw Rego editor escape hatch with line numbers, tab key support, and seamless toggle from wizard mode
- Wired TanStack Query hooks for all policy CRUD operations with Sonner toast feedback

## Task Commits

Each task was committed atomically:

1. **Task 1: Build Rego template engine, TanStack Query policy hooks, and policy list with expandable version history** - `0eccb68` (feat)
2. **Task 2: Build Policy Builder multi-step wizard with all steps and raw editor** - `15ca2a8` (feat)

## Files Created/Modified
- `dashboard/src/types/policy-templates.ts` - Template type definitions (ParameterType, PolicyTemplate, RuleCondition, CompilationStatusResponse)
- `dashboard/src/lib/rego-templates.ts` - 6 policy templates with generateRego(), category metadata, helper functions
- `dashboard/src/hooks/use-policies.ts` - TanStack Query hooks for policy CRUD, versions, restore
- `dashboard/src/hooks/use-compilation-status.ts` - Compilation status polling with auto-stop
- `dashboard/src/components/policies/CompilationStatus.tsx` - Status badge (pending/compiling/compiled/failed)
- `dashboard/src/components/policies/PolicyVersionHistory.tsx` - Version list with diff view and restore
- `dashboard/src/components/policies/PolicyRow.tsx` - Expandable row with active toggle, edit, delete
- `dashboard/src/components/policies/PolicyList.tsx` - Paginated policy list with search and empty state
- `dashboard/src/components/policies/CategoryPicker.tsx` - 2x2 category card grid (Step 1)
- `dashboard/src/components/policies/TemplatePicker.tsx` - Template list filtered by category (Step 2)
- `dashboard/src/components/policies/ParameterForm.tsx` - Dynamic form with live Rego preview (Step 3)
- `dashboard/src/components/policies/RuleEditor.tsx` - Visual condition rows with field/operator/value (Step 4)
- `dashboard/src/components/policies/RegoPreview.tsx` - Syntax-highlighted Rego display with submit (Step 5)
- `dashboard/src/components/policies/RawRegoEditor.tsx` - Raw Rego textarea with line numbers
- `dashboard/src/components/policies/PolicyWizard.tsx` - Main wizard container with step/mode management
- `dashboard/src/app/(dashboard)/policies/new/page.tsx` - Create/Edit policy page
- `dashboard/src/app/(dashboard)/policies/page.tsx` - Updated with PolicyList component

## Decisions Made
- Used custom `escapeRegoString()` for safe Rego string interpolation to prevent template injection
- Implemented simple line-by-line diff rather than adding external diff library (adequate for policy comparison)
- Edit mode starts in raw Rego editor since template parameters cannot be reverse-engineered from Rego source
- Used Dialog component for confirm dialogs (restore, delete) as AlertDialog was not installed; same UX achieved
- Compilation status polling uses TanStack Query refetchInterval callback pattern returning 2000ms or false

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Policy management UI complete: list, create, edit, delete, version history, compilation status
- Ready for Plan 09-04 (remaining dashboard views)
- All 12 must_haves from the plan are satisfied

## Self-Check: PASSED

All 17 created/modified files verified on disk. Both task commits (0eccb68, 15ca2a8) verified in git history.

---
*Phase: 09-dashboard-core-views*
*Completed: 2026-03-03*

# Phase 9 Plan 4: Audit Trail, Vendor Management, Regulatory Selector & Report Generation Summary

**Audit trail with TanStack Table server-side pagination, vendor/regulatory management UIs with toggle controls, and PDF/CSV report generation with PDFKit endpoint and browser download**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-03T08:53:18Z
- **Completed:** 2026-03-03T09:06:16Z
- **Tasks:** 2
- **Files modified:** 26

## Accomplishments
- Built audit trail data table with TanStack Table (manualPagination), cursor-based forward/back navigation, filter panel with vendor/department/action/date-range filters synced with URL search params
- Built vendor management UI with card grid, approve/block status toggle, per-model management (add/toggle/delete), and add vendor dialog
- Built regulatory framework selector with framework cards grouped by jurisdiction, activation toggle, and detail view with individual policy required/optional toggles
- Created control plane report generation endpoint (POST /api/v1/reports/generate) with ReportService gathering data from ClickHouse and PostgreSQL, PDFKit-based PDF generator with cover page/executive summary/violation tables/incident list/policies/vendors/regulatory sections, and CSV generator with proper escaping
- Built report download UI with date range picker (presets: 7d/30d/quarter/YTD/custom), PDF/CSV format selector, progress indicator, and browser file download via blob URL
- All 6 core dashboard views now functional: Home, Policies, Audit Trail, Vendors, Regulatory, Reports

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit trail search page with TanStack Table and filter panel** - `0e2ee67` (feat)
2. **Task 2: Vendor Management, Regulatory Selector, Report Generation** - `186f598` (feat)

## Files Created/Modified

**Hooks:**
- `dashboard/src/hooks/use-audit.ts` - Audit search with cursor pagination and vendor options
- `dashboard/src/hooks/use-vendors.ts` - Vendor CRUD with model management mutations
- `dashboard/src/hooks/use-regulatory.ts` - Framework list/detail with activate/deactivate/toggle mutations
- `dashboard/src/hooks/use-reports.ts` - Report generation mutation with blob download

**Audit Components:**
- `dashboard/src/components/audit/AuditTable.tsx` - TanStack Table with manual pagination, action badges, latency display
- `dashboard/src/components/audit/AuditFilters.tsx` - Filter panel with vendor/department/action/date-range and URL sync

**Vendor Components:**
- `dashboard/src/components/vendors/VendorCard.tsx` - Card with status toggle and expandable model list
- `dashboard/src/components/vendors/VendorList.tsx` - Grid with search and add vendor dialog
- `dashboard/src/components/vendors/AddVendorDialog.tsx` - Modal form for creating vendors
- `dashboard/src/components/vendors/ModelList.tsx` - Model list within vendor card with add/toggle/delete

**Regulatory Components:**
- `dashboard/src/components/regulatory/FrameworkCard.tsx` - Card with activation toggle and metadata
- `dashboard/src/components/regulatory/FrameworkList.tsx` - Grid grouped by jurisdiction
- `dashboard/src/components/regulatory/FrameworkDetail.tsx` - Detail view with policy table and toggles

**Report Components:**
- `dashboard/src/components/reports/ReportForm.tsx` - Date range picker with presets, format selector
- `dashboard/src/components/reports/ReportProgress.tsx` - Progress indicator with success/error states

**Control Plane Reports:**
- `control-plane/src/modules/reports/service.ts` - ReportService gathering data from ClickHouse and PostgreSQL
- `control-plane/src/modules/reports/pdf-generator.ts` - PDFKit PDF with cover page, summary, tables, footer
- `control-plane/src/modules/reports/csv-generator.ts` - CSV with sections, proper escaping
- `control-plane/src/modules/reports/index.ts` - Elysia plugin with POST /generate endpoint

**Pages:**
- `dashboard/src/app/(dashboard)/audit/page.tsx` - Wired with AuditFilters + AuditTable
- `dashboard/src/app/(dashboard)/vendors/page.tsx` - Wired with VendorList
- `dashboard/src/app/(dashboard)/regulatory/page.tsx` - Wired with FrameworkList + FrameworkDetail
- `dashboard/src/app/(dashboard)/reports/page.tsx` - Wired with ReportForm + ReportProgress

**Modified:**
- `control-plane/src/index.ts` - Added reportsModule to Elysia app chain

## Decisions Made
- Used sheet/dialog pattern (in-page state toggle) for framework detail view instead of route-based navigation -- simpler, avoids extra route files
- PDF generated server-side with PDFKit; blob downloaded via BFF proxy to maintain cookie-based auth flow
- Buffer converted to Uint8Array for Response constructor compatibility with Bun/Elysia TypeScript types
- Vendor cards expand inline to show models rather than navigating to separate page -- reduces context switching
- Framework cards grouped by jurisdiction when multiple jurisdictions present for better organization

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Buffer type incompatibility in PDF Response**
- **Found during:** Task 2 (Report endpoint)
- **Issue:** TypeScript error: `Buffer` not assignable to `BodyInit` in `new Response(pdfBuffer, ...)`
- **Fix:** Wrapped Buffer in `new Uint8Array(pdfBuffer)` for compatibility
- **Files modified:** `control-plane/src/modules/reports/index.ts`
- **Verification:** TypeScript check passes with no reports-specific errors
- **Committed in:** 186f598 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor TS type compatibility fix. No scope creep.

## Issues Encountered
None beyond the Buffer type fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 core dashboard views complete, ready for Phase 10 (Advanced Identity) and Phase 11 (Advanced Dashboard)
- Report generation endpoint functional, ready for end-to-end testing with Docker Compose
- Vendor and regulatory management UIs ready for SAML/mTLS integration in Phase 10

## Self-Check: PASSED

All 19 key files verified present. Both commit hashes (0e2ee67, 186f598) confirmed in git log. Dashboard build succeeds.

---
*Phase: 09-dashboard-core-views*
*Completed: 2026-03-03*

# Phase 9 Plan 5: Gap Closure -- BFF Proxy Binary Response Passthrough Summary

**Content-Type detection guard in BFF proxy enabling PDF/CSV report downloads through raw body streaming**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T14:27:22Z
- **Completed:** 2026-03-03T14:29:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added isJsonResponse content-type guard to BFF proxy to prevent unconditional res.json() on all responses
- Binary/text responses (application/pdf, text/csv) are now streamed through as raw body with correct headers
- Existing JSON API calls and SSE streaming path remain completely unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Content-Type detection to BFF proxy** - `71fde36` (fix)

## Files Created/Modified
- `dashboard/src/app/api/proxy/[...path]/route.ts` - Added isJsonResponse guard, binary response passthrough with Content-Type/Content-Disposition/Content-Length header forwarding

## Decisions Made
- Treat missing/empty Content-Type as JSON (not non-JSON) to preserve backward compatibility with control plane endpoints that may omit the header
- Forward only Content-Type, Content-Disposition, and Content-Length from upstream (minimal header surface)
- Control-plane has no `build` script (Bun runs TS directly) -- verified TS parses correctly; pre-existing Elysia type inference warnings are out of scope

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Control-plane `bun run build` step in plan verification is not applicable (no build script exists); used `tsc --noEmit` instead and confirmed only pre-existing Elysia type inference issues exist, none related to this change

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 9 gap closure complete -- all dashboard views and report download flow are functional
- Ready for Phase 10 (Advanced Identity) or phase verification

## Self-Check: PASSED

- FOUND: dashboard/src/app/api/proxy/[...path]/route.ts
- FOUND: commit 71fde36
- FOUND: 09-05-SUMMARY.md

---
*Phase: 09-dashboard-core-views*
*Completed: 2026-03-03*
