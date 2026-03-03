---
phase: 09-dashboard-core-views
verified: 2026-03-03T09:12:20Z
status: gaps_found
score: 5/6 must-haves verified
re_verification: false
gaps:
  - truth: "Compliance officer can generate PDF/CSV compliance reports and download them"
    status: failed
    reason: "BFF proxy calls res.json() on all non-SSE responses (line 74 of proxy route). When the control plane returns a binary PDF or text/csv body, the JSON parse throws and the proxy returns 502. The client-side use-reports.ts hook reads res.ok=false and throws before ever reaching res.blob(). Neither PDF nor CSV download can succeed end-to-end."
    artifacts:
      - path: "dashboard/src/app/api/proxy/[...path]/route.ts"
        issue: "Line 74: const data = await res.json() -- unconditionally parses all non-SSE responses as JSON, breaking binary PDF and CSV text responses from POST /api/v1/reports/generate"
    missing:
      - "Detect Content-Type from upstream response: when it is application/pdf or text/csv, pipe the raw body (res.body or res.arrayBuffer()) back to the client instead of calling res.json()"
      - "Return the upstream Content-Type and Content-Disposition headers so the client blob URL gets the right MIME type"
human_verification:
  - test: "Log in, navigate to Reports, select a date range, click Generate Report (PDF)"
    expected: "File download dialog appears and a valid PDF opens in a PDF viewer"
    why_human: "End-to-end SSE streaming, chart rendering, and visual UI quality cannot be verified programmatically"
  - test: "Log in, open Sidebar in full mode then click Collapse"
    expected: "Sidebar narrows to icon-only (w-16) and tooltips appear on hover"
    why_human: "Visual layout and CSS transition behavior cannot be verified by grep"
  - test: "Log in with an invalid API key"
    expected: "Error message is displayed on the login page, no cookie is set"
    why_human: "Browser cookie behavior and UI error state require runtime verification"
---

# Phase 9: Dashboard Core Views Verification Report

**Phase Goal:** Compliance officer can manage policies, review audit trails, and generate reports through a visual dashboard
**Verified:** 2026-03-03T09:12:20Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Compliance officer can create, edit, enable/disable policies through a visual Policy Builder (DASH-01) | VERIFIED | `PolicyWizard.tsx` wires all 5 steps; `PolicyList.tsx` + `PolicyRow.tsx` implement enable/disable toggle via `usePolicies` hooks; 7 `generateRego()` functions in `rego-templates.ts` (6 templates + one private helper); commits `0eccb68`, `15ca2a8` confirmed in git |
| 2 | Compliance officer can search and filter AI interactions in an Audit Trail dashboard (DASH-02) | VERIFIED | `AuditTable.tsx` uses TanStack Table with `manualPagination: true`; `AuditFilters.tsx` wires `useSearchParams`/`useRouter` for URL sync; `audit/page.tsx` imports both; cursor-based pagination implemented; commit `0e2ee67` confirmed |
| 3 | Compliance officer can view real-time violation statistics on a dashboard home screen (DASH-03) | VERIFIED | `KpiCards`, `ViolationChart`, `VendorUsageChart`, `TimeRangeSelector`, `ActivityFeed` all imported and rendered in `(dashboard)/page.tsx`; `use-dashboard-stats.ts` has `refetchInterval: 30_000` on all hooks; `useSSE` hook connects to `/api/proxy/audit/stream` with 5s auto-reconnect and 50-event cap; commits `ad59339`, `9b660f7` confirmed |
| 4 | Compliance officer can approve/block AI vendors and set model allowlists (DASH-04) | VERIFIED | `VendorCard.tsx` has shadcn `Switch` toggling `approved`/`blocked` status via `useUpdateVendor`; `ModelList.tsx` provides per-model add/toggle/delete; `AddVendorDialog.tsx` implemented; `vendors/page.tsx` wires `VendorList`; commit `186f598` confirmed |
| 5 | Compliance officer can select regulatory jurisdictions and configure framework policies (DASH-05) | VERIFIED | `FrameworkList.tsx` renders cards with activation toggle; `FrameworkDetail.tsx` wires `useToggleFrameworkPolicy` for individual policy toggles; `regulatory/page.tsx` uses in-page state to toggle between list and detail; commit `186f598` confirmed |
| 6 | Compliance officer can generate PDF/CSV compliance reports and download them (DASH-06) | FAILED | Control plane endpoint exists and is wired (`reportsModule` added to `control-plane/src/index.ts` line 90); PDF generator is substantive (534 lines, PDFKit); CSV generator is substantive (140 lines). BUT: BFF proxy unconditionally calls `res.json()` (line 74) on all non-SSE responses -- binary PDF and text/csv bodies cause a JSON parse exception, caught at line 76, returning a 502 error to the client. The `use-reports.ts` hook sees `res.ok=false` and throws before reaching `res.blob()`. Report generation will always fail. |

**Score: 5/6 truths verified**

---

### Required Artifacts

All artifacts from all four plans were verified to exist on disk.

#### Plan 09-01 (Foundation)

| Artifact | Status | Details |
|----------|--------|---------|
| `dashboard/src/app/api/auth/login/route.ts` | VERIFIED | Validates key against control plane, sets httpOnly `interdict_session` cookie (7-day, secure in prod) |
| `dashboard/src/app/api/auth/logout/route.ts` | VERIFIED | Clears session cookie |
| `dashboard/src/app/api/auth/me/route.ts` | VERIFIED | Reads cookie, calls control plane |
| `dashboard/src/app/api/proxy/[...path]/route.ts` | PARTIAL | SSE streaming works; non-SSE proxy works for JSON responses; binary responses broken (see gap) |
| `dashboard/src/middleware.ts` | VERIFIED | Redirects unauthenticated to `/login`, authenticated away from `/login`; correct matcher config |
| `dashboard/src/components/layout/Sidebar.tsx` | VERIFIED | 6 nav links with `usePathname` active state, collapsible w-64/w-16 toggle, status indicator |
| `dashboard/src/components/layout/TopBar.tsx` | VERIFIED | Breadcrumb, ThemeToggle, user dropdown with role badge and sign-out |
| `dashboard/src/app/(dashboard)/layout.tsx` | VERIFIED | Sidebar + TopBar + Sonner Toaster all wired |
| `dashboard/src/types/api.ts` | VERIFIED | TypeScript interfaces for all API response shapes |
| `dashboard/next.config.ts` | VERIFIED | `output: "standalone"` present |
| `docker/dashboard/Dockerfile` | VERIFIED | Multi-stage: bun deps -> bun build -> node:20-slim runner on PORT 3001 |
| `docker-compose.yml` | VERIFIED | Port `8080:3001`, `CONTROL_PLANE_URL=http://control-plane:3000`, `depends_on: control-plane` |

#### Plan 09-02 (Home Screen)

| Artifact | Status | Details |
|----------|--------|---------|
| `dashboard/src/hooks/use-dashboard-stats.ts` | VERIFIED | `refetchInterval: 30_000` on all 4 hooks |
| `dashboard/src/hooks/useSSE.ts` | VERIFIED | Auto-reconnect after 5s, 50-event cap, `mountedRef` cleanup guard |
| `dashboard/src/components/dashboard/KpiCards.tsx` | VERIFIED | 4 cards, skeleton loading |
| `dashboard/src/components/dashboard/ViolationChart.tsx` | VERIFIED | Recharts LineChart with allow/block/redact lines |
| `dashboard/src/components/dashboard/VendorUsageChart.tsx` | VERIFIED | Recharts BarChart with per-vendor aggregation |
| `dashboard/src/components/dashboard/ActivityFeed.tsx` | VERIFIED | Wired to `useSSE("/api/proxy/audit/stream")` with connection status indicator |
| `dashboard/src/app/(dashboard)/page.tsx` | VERIFIED | All 5 dashboard components imported and rendered |

#### Plan 09-03 (Policy Builder)

| Artifact | Status | Details |
|----------|--------|---------|
| `dashboard/src/lib/rego-templates.ts` | VERIFIED | 7 `generateRego` occurrences (6 exported templates + 1 closure); all use `package interdict.policy` + `import rego.v1` with `escapeRegoString()` injection safety |
| `dashboard/src/hooks/use-compilation-status.ts` | VERIFIED | `refetchInterval` callback returns 2000 while pending/compiling, `false` once compiled/failed |
| `dashboard/src/components/policies/PolicyWizard.tsx` | VERIFIED | Imports and renders CategoryPicker, TemplatePicker, ParameterForm, RuleEditor, RegoPreview across 5 steps |
| `dashboard/src/components/policies/PolicyVersionHistory.tsx` | VERIFIED | Line-by-line diff, restore with confirm dialog, `useRestoreVersion` wired |
| `dashboard/src/app/(dashboard)/policies/page.tsx` | VERIFIED | Imports and renders `PolicyList` |
| `dashboard/src/app/(dashboard)/policies/new/page.tsx` | VERIFIED | Renders `PolicyWizard` |

#### Plan 09-04 (Remaining Views)

| Artifact | Status | Details |
|----------|--------|---------|
| `dashboard/src/components/audit/AuditTable.tsx` | VERIFIED | `useReactTable` with `manualPagination: true`, cursor-based navigation |
| `dashboard/src/components/audit/AuditFilters.tsx` | VERIFIED | `useSearchParams` + `useRouter` for URL sync |
| `dashboard/src/components/vendors/VendorCard.tsx` | VERIFIED | shadcn `Switch` toggling `approved`/`blocked` |
| `dashboard/src/components/vendors/AddVendorDialog.tsx` | VERIFIED | Form with name, display_name, base_url, description, status |
| `dashboard/src/components/regulatory/FrameworkDetail.tsx` | VERIFIED | `useToggleFrameworkPolicy` wired for per-policy toggles |
| `dashboard/src/hooks/use-reports.ts` | VERIFIED | `URL.createObjectURL` + temporary `<a>` click pattern for browser download |
| `control-plane/src/modules/reports/index.ts` | VERIFIED | Elysia plugin with POST `/generate` endpoint, auth guard, date range validation |
| `control-plane/src/modules/reports/pdf-generator.ts` | VERIFIED | 534 lines, PDFKit, cover page + executive summary + violation tables + incident list + footer |
| `control-plane/src/modules/reports/csv-generator.ts` | VERIFIED | 140 lines, proper CSV escaping, all sections |
| `control-plane/src/modules/reports/service.ts` | VERIFIED | 375 lines, ClickHouse + PostgreSQL data gathering |
| `control-plane/src/index.ts` | VERIFIED | Line 90: `.use(reportsModule)` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Login page | Control plane `/api/v1/auth/me` | BFF `/api/auth/login/route.ts` | WIRED | Fetches with Bearer token, sets httpOnly cookie |
| Dashboard components | Control plane API | BFF proxy `/api/proxy/[...path]` | WIRED (JSON only) | All JSON API calls proxied with Bearer token injection |
| ActivityFeed | Control plane `/api/v1/audit/stream` | BFF proxy SSE handler | WIRED | SSE path correctly detected and streamed via ReadableStream |
| `use-reports.ts` | Control plane `/api/v1/reports/generate` | BFF proxy line 74 | NOT WIRED | Proxy calls `res.json()` on binary PDF/CSV response, throws, returns 502; download never reaches client |
| `PolicyWizard` | POST `/api/proxy/policies` | `useCreatePolicy` mutation | WIRED | RegoPreview submits via `useCreatePolicy`, toast + redirect on success |
| `AuditFilters` | URL search params | `useSearchParams` + `useRouter` | WIRED | Filters synced bidirectionally with URL |
| `reportsModule` | Elysia app chain | `control-plane/src/index.ts:90` | WIRED | `.use(reportsModule)` confirmed |
| Middleware | Route protection | `interdict_session` cookie check | WIRED | Redirects unauthenticated requests to `/login` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DASH-01 | 09-01, 09-03 | Visual Policy Builder UI, no Rego knowledge required | SATISFIED | 5-step wizard with category/template/parameter/rule/preview steps; 6 templates with `generateRego()`; policy list with active toggle |
| DASH-02 | 09-01, 09-04 | Audit Trail with search and filter | SATISFIED | `AuditTable` with TanStack Table `manualPagination`; `AuditFilters` with URL-synced vendor/department/action/date-range filters |
| DASH-03 | 09-02 | Real-time violation statistics | SATISFIED | KPI cards, charts, 30s polling, SSE activity feed |
| DASH-04 | 09-04 | Vendor Management UI with approve/block and model allowlists | SATISFIED | `VendorCard` with status switch, `ModelList` with per-model toggle, `AddVendorDialog` |
| DASH-05 | 09-04 | Regulatory Framework Selector | SATISFIED | `FrameworkList` + `FrameworkDetail` with activation and per-policy toggles |
| DASH-06 | 09-04 | PDF/CSV compliance report generation | BLOCKED | Control plane endpoint and generators are complete; BFF proxy binary passthrough is missing; reports cannot be downloaded |

No orphaned requirements found. All 6 DASH requirements (DASH-01 through DASH-06) are claimed across the four plans and accounted for.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `dashboard/src/app/api/proxy/[...path]/route.ts` | 74 | `const data = await res.json()` unconditional for all non-SSE responses | Blocker | PDF and CSV report downloads fail at runtime; `res.json()` throws on binary/text bodies, proxy returns 502, client receives error instead of file |

No stub patterns (empty returns, console-only handlers, TODO/FIXME comments, placeholder text) found in any feature component.

---

### Human Verification Required

#### 1. PDF Report Download (after gap fix)

**Test:** Log in, navigate to Reports, select "Last 7 days", choose PDF format, click "Generate Report"
**Expected:** Progress indicator appears; after generation completes, a browser file download dialog opens with a valid PDF file containing the executive summary, violation tables, and all report sections
**Why human:** Binary file download flow and PDF content validity cannot be verified programmatically

#### 2. CSV Report Download (after gap fix)

**Test:** Same flow as above with CSV format selected
**Expected:** A `.csv` file downloads with all sections separated by blank rows and properly escaped values
**Why human:** Binary/text file download flow cannot be verified programmatically

#### 3. Collapsible Sidebar

**Test:** Log in to the dashboard; click the Collapse button at the bottom of the sidebar
**Expected:** Sidebar animates from full width (w-64, showing labels) to icon-only (w-16, showing only icons); hovering over an icon shows a tooltip with the label
**Why human:** CSS transitions and layout visual correctness require browser rendering

#### 4. SSE Activity Feed Live Events

**Test:** With the kernel running and generating AI traffic, navigate to the Dashboard home screen
**Expected:** The Live Activity section shows incoming events in real time with green connection indicator; events show actor, vendor, model, and action badge
**Why human:** Requires a live kernel generating SSE events; cannot simulate in static analysis

#### 5. Dark/Light Theme Toggle

**Test:** Click the theme toggle in the top bar; cycle through Light, Dark, and System options
**Expected:** UI transitions between themes without hydration flash; System mode follows OS preference
**Why human:** Visual appearance and hydration behavior require browser verification

---

### Gaps Summary

One gap blocks full goal achievement:

**DASH-06 partial failure -- BFF proxy cannot pass binary responses through.**

The control plane report generation endpoint (`POST /api/v1/reports/generate`) is fully implemented and wired. The PDF generator (534 lines, PDFKit) and CSV generator (140 lines) are substantive. The client-side report UI (`ReportForm`, `ReportProgress`, `use-reports.ts` with blob download) is correctly implemented and wired in the reports page.

The broken link is in `dashboard/src/app/api/proxy/[...path]/route.ts` at line 74: the standard proxy path calls `res.json()` unconditionally on the upstream response. When the upstream returns `application/pdf` binary data or `text/csv` content, `res.json()` throws a parse error. The catch block returns `{ error: "Proxy request failed" }` with status 502. The `use-reports.ts` hook checks `res.ok` (which is `false` on 502) and throws an error before reaching the `res.blob()` call.

The fix is targeted: detect the upstream `Content-Type` response header in the proxy and, when it is `application/pdf` or `text/csv` (or not `application/json`), pipe the raw response body back with the original headers instead of calling `res.json()`.

This gap affects DASH-06 only. The remaining 5 requirements (DASH-01 through DASH-05) are fully verified.

---

_Verified: 2026-03-03T09:12:20Z_
_Verifier: Claude (gsd-verifier)_
