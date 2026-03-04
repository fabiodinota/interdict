---
phase: 09-dashboard-core-views
plan: 04
subsystem: ui
tags: [react, next.js, tanstack-table, tanstack-query, pdfkit, shadcn, elysia, clickhouse, drizzle]

# Dependency graph
requires:
  - phase: 09-01
    provides: dashboard shell, BFF proxy, shadcn components, TanStack Query provider
  - phase: 09-03
    provides: policy builder and policy list patterns
provides:
  - Audit trail data table with server-side pagination and filtering
  - Vendor management UI with approve/block toggle and per-model control
  - Regulatory framework selector with activation and policy toggles
  - Report generation endpoint (PDF/CSV) on control plane
  - Report download UI with date range picker and progress indicator
  - All 6 core compliance officer views complete
affects: [phase-10-advanced-identity, phase-11-advanced-dashboard, phase-12-deployment]

# Tech tracking
tech-stack:
  added: [pdfkit]
  patterns: [cursor-based pagination with TanStack Table manualPagination, URL search params sync for filter state, blob download for file generation, grouped card grid for entity management]

key-files:
  created:
    - dashboard/src/hooks/use-audit.ts
    - dashboard/src/hooks/use-vendors.ts
    - dashboard/src/hooks/use-regulatory.ts
    - dashboard/src/hooks/use-reports.ts
    - dashboard/src/components/audit/AuditTable.tsx
    - dashboard/src/components/audit/AuditFilters.tsx
    - dashboard/src/components/vendors/VendorCard.tsx
    - dashboard/src/components/vendors/VendorList.tsx
    - dashboard/src/components/vendors/AddVendorDialog.tsx
    - dashboard/src/components/vendors/ModelList.tsx
    - dashboard/src/components/regulatory/FrameworkCard.tsx
    - dashboard/src/components/regulatory/FrameworkList.tsx
    - dashboard/src/components/regulatory/FrameworkDetail.tsx
    - dashboard/src/components/reports/ReportForm.tsx
    - dashboard/src/components/reports/ReportProgress.tsx
    - control-plane/src/modules/reports/index.ts
    - control-plane/src/modules/reports/service.ts
    - control-plane/src/modules/reports/pdf-generator.ts
    - control-plane/src/modules/reports/csv-generator.ts
  modified:
    - dashboard/src/app/(dashboard)/audit/page.tsx
    - dashboard/src/app/(dashboard)/vendors/page.tsx
    - dashboard/src/app/(dashboard)/regulatory/page.tsx
    - dashboard/src/app/(dashboard)/reports/page.tsx
    - control-plane/src/index.ts

key-decisions:
  - "Used sheet/dialog pattern (in-page state toggle) for framework detail view instead of route-based navigation for simplicity"
  - "PDF generated server-side with PDFKit; blob downloaded via BFF proxy to maintain cookie-based auth"
  - "Buffer converted to Uint8Array for Response constructor compatibility with Bun/Elysia TS types"
  - "Vendor cards expand inline to show models rather than navigating to separate page"
  - "Framework cards grouped by jurisdiction when multiple jurisdictions present"

patterns-established:
  - "Cursor stack pattern: store cursors[] for forward/backward pagination with TanStack Table manualPagination"
  - "Filter-URL sync pattern: read initial filters from searchParams, update URL on apply"
  - "Blob download pattern: fetch binary, create objectURL, trigger <a> click, revoke URL"
  - "Card grid with toggle: consistent card layout with Switch for status toggling across vendors and frameworks"

requirements-completed: [DASH-02, DASH-04, DASH-05, DASH-06]

# Metrics
duration: 12min
completed: 2026-03-03
---

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
