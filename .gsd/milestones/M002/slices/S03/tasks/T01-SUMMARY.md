---
id: T01
parent: S03
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
# T01: Plan 01

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
