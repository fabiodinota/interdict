# Phase 9: Dashboard Core Views - Research

**Researched:** 2026-03-03
**Domain:** Next.js frontend dashboard consuming Elysia REST/SSE APIs
**Confidence:** HIGH

## Summary

Phase 9 is a greenfield Next.js App Router frontend that replaces the static nginx placeholder from Phase 8. The dashboard provides six core compliance officer views: Policy Builder, Audit Trail, Dashboard Home (real-time stats), Vendor Management, Regulatory Framework Selector, and Report Generation. All data comes from the existing control plane REST API built in prior phases (Elysia on Bun at port 3000).

The containerclaw reference project (`/Users/fabiodinota/Documents/containerclaw/dashboard/`) provides a proven blueprint for sidebar + topbar layout, next-themes dark/light/system toggle, Sonner toast notifications, shadcn/ui component library with New York style, and Suspense boundary patterns. The Interdict dashboard adapts this foundation while replacing PocketBase auth with Bearer token API key authentication.

The most complex novel work is the Policy Builder wizard (template-based Rego generation from form inputs, live compilation status tracking) and the real-time dashboard home screen (SSE activity feed + polling for chart stats). PDF report generation on the server side requires a Bun-compatible library -- PDFKit is the safest choice over Puppeteer (which has known Bun compatibility issues).

**Primary recommendation:** Use Next.js 16 + shadcn/ui + Tailwind v4 mirroring the containerclaw patterns, TanStack Query v5 for data fetching/caching, TanStack Table for the audit trail, Recharts 3.x for charts, and PDFKit for server-side PDF generation. Build the dashboard as its own Next.js project at `dashboard/` in the repo root, with `output: "standalone"` for Docker.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Next.js App Router -- same framework as the containerclaw dashboard reference project
- shadcn/ui + Tailwind CSS v4 -- same component library and styling approach as containerclaw
- Bun as package manager (consistent with control plane)
- Dashboard runs as its own Next.js server process in the Docker stack (replaces the static nginx placeholder)
- Persistent left sidebar with icon + label links: Home, Policies, Audit Trail, Vendors, Regulatory, Reports -- same pattern as containerclaw's Sidebar component
- Top bar for breadcrumbs/user info -- same pattern as containerclaw's TopBar
- Sidebar collapsible for more screen space
- Layout structure: sidebar (fixed width) + main content area (flex), with Suspense-wrapped sidebar to avoid layout blocking
- Login page with API key input -- user pastes their API key into a login form
- API key stored in cookie/session (httpOnly for security)
- Bearer token auth matching the existing control plane auth middleware
- No email/password flow -- uses the existing API key auth system from Phase 7
- Dark + light + system toggle via next-themes -- same approach as containerclaw
- CSS variables for theming, compatible with shadcn/ui
- Theme toggle in top bar or settings area
- Policy Builder: Hybrid wizard (category -> template -> parameters -> optional visual rule editor -> preview Rego -> submit)
- Core governance template set (5-7 templates): Block vendor, PII detection/redact, Rate limit by department, Content length limit, Allowed model versions, Jurisdiction restrict
- Live compilation status tracking inline: "Compiling..." -> "Compiled" or "Error" with details; auto-poll the compilation-status endpoint until done
- Expandable row pattern for policy list: shows current version, click to expand and see version history with diff view and restore button
- Dashboard home: 4 KPI cards (total requests today, violations today, active policies, active vendors), violation trend line chart + vendor usage bar chart with time range selector (24h/7d/30d), live activity feed panel showing real-time audit events via SSE
- Hybrid refresh strategy: SSE for the activity feed (instant), 30-second polling for aggregated chart stats
- Recharts library for all data visualization
- Manual refresh button + last-updated timestamp on chart panels
- Server-side report generation via new control plane endpoint
- Client downloads the generated file (PDF or CSV)
- Comprehensive report content: executive summary, policy violations by type/department/vendor, audit trail highlights (top 10 incidents), active policies list, vendor approval status, regulatory framework compliance status, date range on every page
- Presets + custom date range: Last 7 days, Last 30 days, Last quarter, Year to date, plus custom date range picker
- Progress indicator (spinner/progress bar) during generation
- Advanced users can toggle to raw Rego editor at any point in Policy Builder
- Step 4 visual rule editor: simple condition rows [Field] [Operator] [Value] with AND/OR connectors (like email filter rules, not drag-and-drop blocks)
- Follow containerclaw dashboard patterns wherever applicable

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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Compliance officer can create, edit, enable/disable governance policies through a visual Policy Builder UI (no Rego knowledge required) | Policy Builder wizard pattern with template-based Rego generation, TanStack Query for API mutations, expandable row pattern for version history, raw Rego editor toggle for advanced users |
| DASH-02 | Compliance officer can search and filter all AI interactions and policy decisions in an Audit Trail dashboard | TanStack Table with server-side pagination/filtering, control plane audit search API with cursor pagination, filter params for vendor/department/actor/policy_action/date range |
| DASH-03 | Compliance officer can view real-time violation statistics (by type, department, vendor, time period) on a dashboard home screen | Recharts 3.x for line/bar charts, SSE EventSource hook for live activity feed, 30-second polling for aggregated stats from ClickHouse materialized views, KPI cards with auto-refresh |
| DASH-04 | Compliance officer can approve/block AI vendors and set model version allowlists through a Vendor Management UI | TanStack Query mutations against vendors CRUD API, status toggle (approved/blocked), per-model control via vendor/:id/models endpoints |
| DASH-05 | Compliance officer can select regulatory jurisdictions and see corresponding policy configurations enabled through a Regulatory Framework Selector | Regulatory API: list frameworks, activate/deactivate by slug, toggle individual policies; UI shows framework cards with activation toggle and nested policy list |
| DASH-06 | Compliance officer can generate PDF/CSV compliance reports for regulators, legal teams, and risk departments | PDFKit for server-side PDF generation (Bun-compatible), csv-stringify or manual CSV generation, new control plane `/api/v1/reports/generate` endpoint, date range picker with presets |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.x | Full-stack React framework (App Router) | Locked decision; matches containerclaw; Turbopack default bundler, React 19 support, standalone Docker output |
| React | 19.x | UI rendering | Ships with Next.js 16; concurrent features, Suspense for data fetching |
| Tailwind CSS | 4.x | Utility-first CSS framework | Locked decision; matches containerclaw; v4 uses CSS-first config with `@theme` directives |
| shadcn/ui | latest (shadcn CLI v3.x) | Component library (New York style) | Locked decision; copy-paste components using Radix primitives, fully customizable |
| next-themes | 0.4.x | Dark/light/system theme toggle | Locked decision; 2-line setup, no flash, works with App Router |
| Lucide React | latest | Icon library | Matches containerclaw; tree-shakeable, consistent design |
| TanStack Query | 5.90.x | Server state management and caching | Best React data fetching library; handles caching, refetch, mutations, polling; 20% smaller than v4 |
| TanStack Table | 8.x | Headless data table for audit trail | Industry standard for server-side pagination/sorting/filtering; shadcn DataTable wraps it |
| Recharts | 3.7.x | Chart library (line, bar, area charts) | Locked decision; built on React+D3, native SVG, 3.6M weekly downloads |
| Sonner | 2.x | Toast notifications | Matches containerclaw pattern; bottom-right with rich colors |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PDFKit | latest | Server-side PDF generation | Report generation endpoint (DASH-06); confirmed Bun-compatible |
| zod | 4.x | Runtime type validation | Form validation in Policy Builder wizard, API response validation |
| date-fns | latest | Date manipulation and formatting | Date range picker, chart time axis formatting, report date ranges |
| clsx + tailwind-merge | latest | Conditional CSS class merging | Same pattern as containerclaw's `cn()` utility |
| tw-animate-css | latest | Tailwind animation utilities | Matches containerclaw; shadcn animation support |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Query | SWR | TanStack Query has better mutation support, devtools, and suspense integration; SWR is simpler but less powerful for complex dashboard patterns |
| TanStack Table | Manual table + shadcn Table | TanStack Table adds ~15KB but saves massive effort for pagination, sorting, column visibility, and filtering state management |
| PDFKit | Puppeteer | Puppeteer has known Bun compatibility issues (corrupt PDFs per GitHub issue #8482); PDFKit works natively |
| PDFKit | pdf-lib | pdf-lib is better for editing existing PDFs; PDFKit is better for generating new documents from scratch (our use case) |
| Recharts | Nivo / Victory | Recharts is locked decision; simpler API, better React integration, lighter weight |

**Installation:**
```bash
bun add next@16 react@19 react-dom@19 @tanstack/react-query@5 @tanstack/react-table@8 recharts@3 next-themes sonner lucide-react zod date-fns clsx tailwind-merge tw-animate-css pdfkit
bun add -d tailwindcss@4 @tailwindcss/postcss typescript @types/node @types/react @types/react-dom shadcn eslint eslint-config-next@16
```

## Architecture Patterns

### Recommended Project Structure
```
dashboard/
├── public/                     # Static assets
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (ThemeProvider, font, metadata)
│   │   ├── globals.css         # Tailwind imports + CSS variables for theming
│   │   ├── login/
│   │   │   └── page.tsx        # API key login form
│   │   └── (dashboard)/        # Route group with auth guard
│   │       ├── layout.tsx      # Sidebar + TopBar + Suspense boundaries
│   │       ├── page.tsx        # Home (KPI cards + charts + activity feed)
│   │       ├── policies/
│   │       │   ├── page.tsx    # Policy list with expandable rows
│   │       │   └── new/
│   │       │       └── page.tsx # Policy Builder wizard
│   │       ├── audit/
│   │       │   └── page.tsx    # Audit trail search + data table
│   │       ├── vendors/
│   │       │   └── page.tsx    # Vendor management
│   │       ├── regulatory/
│   │       │   └── page.tsx    # Regulatory framework selector
│   │       └── reports/
│   │           └── page.tsx    # Report generation
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components (generated via CLI)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx     # Persistent left nav
│   │   │   └── TopBar.tsx      # Breadcrumbs + user info + theme toggle
│   │   ├── policies/
│   │   │   ├── PolicyWizard.tsx       # Multi-step wizard container
│   │   │   ├── CategoryPicker.tsx     # Step 1
│   │   │   ├── TemplatePicker.tsx     # Step 2
│   │   │   ├── ParameterForm.tsx      # Step 3
│   │   │   ├── RuleEditor.tsx         # Step 4 (condition rows)
│   │   │   ├── RegoPreview.tsx        # Step 5
│   │   │   ├── RawRegoEditor.tsx      # Advanced toggle
│   │   │   └── PolicyVersionHistory.tsx # Expandable version list + diff
│   │   ├── audit/
│   │   │   ├── AuditTable.tsx         # TanStack Table wrapper
│   │   │   └── AuditFilters.tsx       # Filter panel
│   │   ├── dashboard/
│   │   │   ├── KpiCards.tsx           # 4 KPI stat cards
│   │   │   ├── ViolationChart.tsx     # Line chart
│   │   │   ├── VendorUsageChart.tsx   # Bar chart
│   │   │   └── ActivityFeed.tsx       # SSE-powered live feed
│   │   ├── vendors/
│   │   │   └── VendorCard.tsx         # Vendor with model list
│   │   ├── regulatory/
│   │   │   └── FrameworkCard.tsx       # Framework with policy toggles
│   │   ├── reports/
│   │   │   └── ReportForm.tsx         # Date range + format selector
│   │   ├── theme-provider.tsx         # next-themes wrapper
│   │   └── theme-toggle.tsx           # Theme dropdown toggle
│   ├── hooks/
│   │   ├── useSSE.ts                  # EventSource SSE hook with reconnect
│   │   ├── useAuth.ts                 # Auth context, login/logout, API key cookie
│   │   └── use-policies.ts            # TanStack Query hooks for policies
│   ├── lib/
│   │   ├── api.ts                     # Fetch wrapper with Bearer token injection
│   │   ├── auth.ts                    # Cookie management, session logic
│   │   ├── utils.ts                   # cn() utility, formatters
│   │   ├── rego-templates.ts          # Policy template definitions + Rego generation
│   │   └── query-client.ts            # TanStack Query client config
│   └── types/
│       ├── api.ts                     # API response types mirroring control plane
│       └── policy-templates.ts        # Template type definitions
├── next.config.ts
├── tailwind.config.ts (or CSS-first config in globals.css)
├── tsconfig.json
├── package.json
├── Dockerfile
└── .dockerignore
```

### Pattern 1: API Client with Bearer Token Injection
**What:** Centralized fetch wrapper that reads the API key from an httpOnly cookie and attaches it as a Bearer token on every request.
**When to use:** Every API call from the dashboard to the control plane.
**Example:**
```typescript
// src/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface ApiOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  // For server components, read cookie directly
  // For client components, cookie is sent automatically (same-origin)
  const res = await fetch(url.toString(), {
    ...fetchOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `API error ${res.status}`);
  }

  return res.json();
}
```

**Important API note:** The control plane uses Bearer token auth (`Authorization: Bearer <api_key>`), not cookie auth. The dashboard needs a Next.js API route (BFF pattern) that reads the API key from the httpOnly cookie and proxies requests with the Bearer token, OR the client stores the API key in a cookie and sends it via a client-side fetch interceptor.

### Pattern 2: TanStack Query with Server-Side Pagination
**What:** Hooks that manage server-side pagination state, synced with URL params and the API's cursor-based pagination.
**When to use:** Audit trail data table, policy list.
**Example:**
```typescript
// src/hooks/use-audit.ts
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface AuditFilters {
  vendor?: string;
  department?: string;
  policy_action?: "allow" | "block" | "redact";
  from_date?: string;
  to_date?: string;
}

export function useAuditSearch(filters: AuditFilters, cursor?: string, pageSize = 50) {
  return useQuery({
    queryKey: ["audit", "search", filters, cursor, pageSize],
    queryFn: () =>
      api("/api/v1/audit/search", {
        params: {
          ...(filters.vendor && { vendor: filters.vendor }),
          ...(filters.department && { department: filters.department }),
          ...(filters.policy_action && { policy_action: filters.policy_action }),
          ...(filters.from_date && { from_date: filters.from_date }),
          ...(filters.to_date && { to_date: filters.to_date }),
          ...(cursor && { cursor }),
          page_size: String(pageSize),
        },
      }),
    placeholderData: keepPreviousData,
  });
}
```

### Pattern 3: SSE Hook with Reconnection
**What:** Custom React hook that connects to the audit SSE stream, buffers events, and auto-reconnects on failure.
**When to use:** Activity feed on the dashboard home screen.
**Example:**
```typescript
// src/hooks/useSSE.ts
import { useEffect, useRef, useState, useCallback } from "react";

interface SSEEvent {
  event: string;
  data: string;
}

export function useSSE(url: string, options?: { maxEvents?: number }) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const maxEvents = options?.maxEvents ?? 50;

  const connect = useCallback(() => {
    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener("connected", () => setConnected(true));
    es.addEventListener("audit-event", (e) => {
      setEvents((prev) => [{ event: "audit-event", data: e.data }, ...prev].slice(0, maxEvents));
    });
    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 5 seconds
      setTimeout(connect, 5000);
    };

    esRef.current = es;
  }, [url, maxEvents]);

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, [connect]);

  return { events, connected };
}
```

### Pattern 4: Policy Builder Rego Template Generation
**What:** TypeScript template definitions that generate valid Rego source code from structured form inputs.
**When to use:** Policy Builder wizard Steps 1-5.
**Example:**
```typescript
// src/lib/rego-templates.ts
interface PolicyTemplate {
  id: string;
  category: "vendor_control" | "content_inspection" | "rate_limiting" | "custom";
  name: string;
  description: string;
  parameters: TemplateParameter[];
  generateRego: (params: Record<string, unknown>) => string;
}

interface TemplateParameter {
  key: string;
  label: string;
  type: "text" | "select" | "toggle" | "number" | "multi-select";
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  required: boolean;
}

const blockVendorTemplate: PolicyTemplate = {
  id: "block-vendor",
  category: "vendor_control",
  name: "Block Vendor",
  description: "Block requests to a specific AI vendor",
  parameters: [
    { key: "vendor_name", label: "Vendor Name", type: "select", options: [], required: true },
    { key: "action", label: "Action", type: "select", options: [
      { value: "block", label: "Block" }, { value: "allow", label: "Allow" }
    ], required: true },
  ],
  generateRego: (params) => `package interdict.policy

import rego.v1

default verdict := {"action": "allow"}

verdict := {"action": "${params.action}"} if {
    input.request.vendor == "${params.vendor_name}"
}`,
};
```

### Pattern 5: Next.js Standalone Docker Build
**What:** Multi-stage Dockerfile using `output: "standalone"` for minimal production images.
**When to use:** Dashboard container in docker-compose.
**Example:**
```dockerfile
# Stage 1: Dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Stage 3: Production
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
```

**Note:** Next.js standalone output produces a `server.js` that runs under Node.js, even though Bun is used for dependency management and building. This is the standard pattern.

### Anti-Patterns to Avoid
- **Fetching in layout.tsx without Suspense:** Layout fetches block all child renders. Wrap data-dependent layout sections in `<Suspense>`.
- **Storing API key in localStorage:** XSS-vulnerable. Use httpOnly cookies set via Next.js API route.
- **Full-buffering SSE responses:** Don't accumulate unlimited events. Cap the event array and discard old entries (pattern 3 shows `maxEvents`).
- **Client-side report generation:** PDFs must be generated server-side to access all data and avoid browser memory issues. The client downloads the result.
- **Polling ClickHouse on every component mount:** Use TanStack Query's `refetchInterval` (30s) and `staleTime` to prevent duplicate requests from multiple components reading the same data.
- **Building a custom Rego parser:** Template-based generation avoids Rego parsing entirely. Templates produce valid Rego from structured inputs. Only the advanced raw editor sends user-written Rego (which the API validates via OPA before saving).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data table with pagination, sorting, column visibility | Custom table component | TanStack Table + shadcn DataTable | Hundreds of edge cases: keyboard nav, column resize, virtualization, accessible headers |
| Form state management for multi-step wizard | Custom reducer + context | React Hook Form or plain useState per step | Multi-step wizard state is simple enough for useState; React Hook Form for complex validation |
| Date range picker | Custom calendar component | shadcn Calendar + Popover (uses Radix DatePicker) | Date edge cases (timezones, leap years, locale) are treacherous |
| Server state caching | Custom fetch + useState + useEffect | TanStack Query | Cache invalidation, background refetch, optimistic updates, retry logic, deduplication |
| Theme toggle persistence | Custom localStorage + context | next-themes | Handles SSR hydration mismatch, system preference detection, flash prevention |
| Toast notifications | Custom toast system | Sonner | Stacking, auto-dismiss, animation, accessible ARIA |
| CSV generation | Manual string concatenation | Simple join with proper escaping | CSV escaping rules (commas in values, quotes, newlines) are tricky; use a utility function |
| PDF report layout | Manual coordinate math | PDFKit's document API | PDFKit handles pagination, text wrapping, tables, headers/footers |

**Key insight:** This phase is a large frontend with many views. Every hour saved on utility problems (tables, forms, toasts) can be invested in the novel domain logic (Rego template generation, real-time SSE integration, compilation status polling).

## Common Pitfalls

### Pitfall 1: API Key Cookie Security
**What goes wrong:** API key stored in plain cookie accessible to JavaScript; stolen via XSS.
**Why it happens:** Quick implementation stores key in `document.cookie` or localStorage.
**How to avoid:** Use a Next.js API route (`/api/auth/login`) that receives the API key, validates it against the control plane `/api/v1/auth/me` endpoint, and sets an httpOnly, Secure, SameSite=Lax cookie. Client never sees the raw key after login.
**Warning signs:** API key visible in browser devtools Application > Cookies without httpOnly flag.

### Pitfall 2: CORS Between Dashboard and Control Plane
**What goes wrong:** Dashboard at `localhost:8080` can't fetch from control plane at `localhost:3000` due to CORS.
**Why it happens:** Different ports = different origins. Browser blocks cross-origin requests without proper CORS headers.
**How to avoid:** Two options: (1) Use Next.js API routes as a BFF proxy (dashboard calls its own backend which proxies to control plane), or (2) Configure CORS on the Elysia control plane to allow the dashboard origin. BFF proxy is more secure and avoids exposing the control plane directly.
**Warning signs:** Browser console shows `Access-Control-Allow-Origin` errors.

### Pitfall 3: SSE Connection Leaks
**What goes wrong:** Multiple SSE connections opened as user navigates between pages, never cleaned up.
**Why it happens:** EventSource created in useEffect without proper cleanup, or component remounts.
**How to avoid:** Always close EventSource in useEffect cleanup. Use a ref to track the connection. Consider a single SSE connection at the layout level, shared via context.
**Warning signs:** Network tab shows many pending EventSource connections. Server logs show many open /audit/stream connections.

### Pitfall 4: Hydration Mismatch with Theme
**What goes wrong:** Server renders light theme, client hydrates with dark theme from localStorage, causing a flash.
**Why it happens:** Server doesn't know the user's theme preference at render time.
**How to avoid:** Use next-themes with `attribute="class"` and add `suppressHydrationWarning` to the `<html>` element. The script injected by next-themes sets the class before React hydrates.
**Warning signs:** Brief white flash on page load in dark mode.

### Pitfall 5: Rego Generation Producing Invalid Syntax
**What goes wrong:** Template string interpolation produces Rego that fails OPA validation.
**Why it happens:** User input contains special characters, or template logic has edge cases.
**How to avoid:** Always validate generated Rego by calling the existing `validateRego()` function via the API before submission. Show validation errors inline in the wizard preview step. Escape string values properly in templates.
**Warning signs:** Policy creation returns 400 with "Invalid Rego syntax" consistently.

### Pitfall 6: Docker Build Failing on Bun + Next.js Standalone
**What goes wrong:** `bun run build` succeeds but `.next/standalone` doesn't contain all required files.
**Why it happens:** Next.js standalone output expects `node_modules` in a specific structure; Bun's module resolution differs slightly.
**How to avoid:** Set `output: "standalone"` in `next.config.ts`. The final production stage should use `node:20-slim` (not Bun) because the standalone server.js is designed for Node.js. Copy `.next/standalone`, `.next/static`, and `public/` to the production image.
**Warning signs:** `Error: Cannot find module` at container startup.

### Pitfall 7: Audit Trail Table Performance with Large Datasets
**What goes wrong:** Loading all audit records at once crashes the browser or causes severe lag.
**Why it happens:** Client-side pagination or forgetting to implement cursor-based pagination.
**How to avoid:** Use `manualPagination: true` in TanStack Table. Pass `cursor` and `page_size` params to the API. Never load more than one page at a time. The API already supports cursor-based pagination.
**Warning signs:** Browser becomes unresponsive when navigating to audit trail.

## Code Examples

### API Response Type Definitions
```typescript
// src/types/api.ts -- mirrors control plane response shapes

/** Standard API response envelope */
interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/** Paginated response with cursor */
interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}

/** Audit record from GET /api/v1/audit/search */
interface AuditRecord {
  timestamp: string;
  bundle_id: string;
  kernel_id: string;
  actor_identity: string;
  actor_display_name: string | null;
  department: string;
  department_display_name: string | null;
  vendor: string;
  vendor_display_name: string | null;
  model: string;
  policy_action: "allow" | "block" | "redact";
  policy_rules: unknown[];
  token_count: number;
  enforcement_latency_us: number;
  chain_hash: string;
  prompt_hash: string;
  response_hash: string;
}

/** Policy from GET /api/v1/policies */
interface Policy {
  id: string;
  name: string;
  description: string | null;
  current_version?: PolicyVersion;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Policy version */
interface PolicyVersion {
  id: string;
  version: number;
  rego_source: string;
  entrypoint: string;
  compilation_status: "pending" | "compiling" | "compiled" | "failed";
  compilation_error: string | null;
  wasm_hash: string | null;
  wasm_size_bytes: number | null;
  created_at: string;
  change_description: string | null;
}

/** Vendor from GET /api/v1/vendors */
interface Vendor {
  id: string;
  name: string;
  display_name: string;
  status: "approved" | "blocked";
  base_url: string | null;
  description: string | null;
  models: VendorModel[];
}

interface VendorModel {
  id: string;
  model_name: string;
  status: "approved" | "blocked";
}

/** Framework from GET /api/v1/regulatory/frameworks */
interface RegulatoryFramework {
  id: string;
  slug: string;
  name: string;
  description: string;
  jurisdiction: string;
  version: string;
  isSeeded: boolean;
  isActive: boolean;
  policyCount: number;
  activePolicyCount: number;
}

/** Hourly violations from GET /api/v1/audit/stats/violations */
interface HourlyViolation {
  hour: string;
  policy_action: string;
  violation_count: number;
  unique_actors: number;
  unique_vendors: number;
}

/** Vendor usage from GET /api/v1/audit/stats/vendor-usage */
interface VendorUsage {
  hour: string;
  vendor: string;
  model: string;
  request_count: number;
  total_tokens: number;
  avg_latency_us: number;
}
```

### Login Flow with httpOnly Cookie
```typescript
// src/app/api/auth/login/route.ts (Next.js API Route)
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || "http://control-plane:3000";

export async function POST(req: Request) {
  const { apiKey } = await req.json();

  // Validate the API key against the control plane
  const meRes = await fetch(`${CONTROL_PLANE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!meRes.ok) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const user = await meRes.json();

  // Store API key in httpOnly cookie (never exposed to client JS)
  const cookieStore = await cookies();
  cookieStore.set("interdict_session", apiKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return NextResponse.json({ success: true, data: user.data });
}
```

### BFF Proxy Pattern for API Calls
```typescript
// src/app/api/proxy/[...path]/route.ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || "http://control-plane:3000";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const cookieStore = await cookies();
  const apiKey = cookieStore.get("interdict_session")?.value;

  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(`${CONTROL_PLANE_URL}/api/v1/${path.join("/")}${req.nextUrl.search}`);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// POST, PUT, DELETE handlers follow the same pattern
```

### Theme Setup (following containerclaw)
```typescript
// src/app/layout.tsx
import { ThemeProvider } from "@/components/theme-provider";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Compilation Status Polling
```typescript
// src/hooks/use-compilation-status.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useCompilationStatus(policyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["compilation-status", policyId],
    queryFn: () => api(`/api/v1/policies/${policyId}/compilation-status`),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.compilation_status;
      // Stop polling once compiled or failed
      if (status === "compiled" || status === "failed") return false;
      return 2000; // Poll every 2 seconds
    },
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js Pages Router | App Router (default since Next.js 13.4) | 2023 | Layout-based routing, React Server Components, streaming |
| SWR for data fetching | TanStack Query v5 | 2023 | Better mutations, suspense, devtools |
| Tailwind CSS v3 (JS config) | Tailwind CSS v4 (CSS-first config) | 2025 | `@theme inline` in CSS, no tailwind.config.js needed, `@custom-variant` |
| shadcn/ui manual copy | shadcn CLI v3.x (`npx shadcn add`) | 2024 | Auto-generates components with proper imports |
| Recharts 2.x | Recharts 3.x | 2024 | Improved tree-shaking, TypeScript types, SSR support |
| next/image (Pages Router) | next/image (App Router, optimized) | 2023 | Better LCP, automatic format detection |
| Implicit caching in Next.js | Opt-in caching with `"use cache"` directive | Next.js 16 (2025) | All dynamic code executes at request time by default; caching is explicit |
| React 18 | React 19 (ships with Next.js 16) | 2025 | Concurrent features stable, improved Suspense |

**Deprecated/outdated:**
- `getServerSideProps` / `getStaticProps`: Replaced by async Server Components in App Router
- `pages/api/` routes: Still work but `app/api/route.ts` is the App Router equivalent
- `tailwind.config.js`: Tailwind v4 uses CSS-first configuration; JS config still supported but not recommended
- `cacheTime` in TanStack Query: Renamed to `gcTime` in v5
- `isLoading` in TanStack Query: Renamed to `isPending` in v5

## Open Questions

1. **Report endpoint location: dashboard API route vs control plane?**
   - What we know: CONTEXT.md says "server-side report generation via new control plane endpoint." PDFKit needs to run on the server.
   - What's unclear: The control plane runs on Bun/Elysia. PDFKit is confirmed Bun-compatible. The dashboard could also generate PDFs in its Next.js API routes.
   - Recommendation: Add a new report generation endpoint to the control plane (`/api/v1/reports/generate`) since it has direct database access for querying all the report data. The dashboard just triggers it and downloads the result. This avoids duplicating data access logic in the dashboard.

2. **Dashboard port in Docker**
   - What we know: Currently the nginx placeholder serves on port 80 (mapped to 8080 on host). Next.js standalone server defaults to port 3000.
   - What's unclear: Whether to change the internal port to 3000 (Next.js default) or configure it to listen on 80.
   - Recommendation: Use `PORT=3001` env var for the Next.js server inside the container (avoiding conflict with control plane's 3000), map to 8080 on host. Update docker-compose.yml accordingly.

3. **SSE authentication for the activity feed**
   - What we know: The audit SSE endpoint at `/api/v1/audit/stream` requires Bearer token auth (read_only_auditor+). The browser's native `EventSource` API does not support custom headers.
   - What's unclear: How to pass the Bearer token to the SSE endpoint.
   - Recommendation: Use a Next.js API route as an SSE proxy (`/api/proxy/audit/stream`) that reads the httpOnly cookie, connects to the control plane SSE with the Bearer token, and streams events back to the client. Alternatively, use `fetch()` with ReadableStream instead of native EventSource to support custom headers.

4. **Rego template complexity**
   - What we know: STATE.md flags "Policy Builder Rego generation from visual inputs needs focused spike." Templates must produce valid Rego that compiles to Wasm.
   - What's unclear: Whether the 5-7 template set covers all the patterns needed for the law firm pilot.
   - Recommendation: Start with the locked template set (Block vendor, PII detection/redact, Rate limit by department, Content length limit, Allowed model versions, Jurisdiction restrict). Each template is a TypeScript function that takes structured params and returns a Rego string. The advanced raw editor provides an escape hatch for anything templates don't cover. Validate all generated Rego via the existing OPA validator before submission.

## Sources

### Primary (HIGH confidence)
- Containerclaw reference dashboard: `/Users/fabiodinota/Documents/containerclaw/dashboard/` -- layout patterns, auth flow, theme setup, shadcn component organization, Sidebar/TopBar structure
- Interdict control plane API modules: `control-plane/src/modules/{policies,audit,vendors,regulatory,compiler}/index.ts` -- exact API endpoints, request/response shapes, auth requirements
- Interdict auth service: `control-plane/src/modules/auth/service.ts` -- AuthenticatedUser type, API key validation flow
- Interdict shared utilities: `control-plane/src/shared/utilities.ts` -- response envelope format, cursor pagination helpers

### Secondary (MEDIUM confidence)
- [Next.js 16 blog](https://nextjs.org/blog/next-16) -- Turbopack default, React 19, opt-in caching
- [Next.js deployment docs](https://nextjs.org/docs/app/getting-started/deploying) -- standalone output, Docker patterns
- [TanStack Query v5 docs](https://tanstack.com/query/v5/docs/framework/react/overview) -- hooks API, refetchInterval, placeholderData
- [TanStack Table pagination guide](https://tanstack.com/table/v8/docs/guide/pagination) -- manualPagination, server-side patterns
- [shadcn/ui DataTable](https://ui.shadcn.com/docs/components/radix/data-table) -- TanStack Table integration with shadcn components
- [shadcn/ui dark mode for Next.js](https://ui.shadcn.com/docs/dark-mode/next) -- next-themes setup
- [Recharts GitHub](https://github.com/recharts/recharts) -- v3.7.0, React+D3 chart library
- [next-themes GitHub](https://github.com/pacocoursey/next-themes) -- v0.4.x, dark mode with no flash

### Tertiary (LOW confidence)
- Bun + Puppeteer compatibility issues: [GitHub issue #8482](https://github.com/oven-sh/bun/issues/8482) -- corrupt PDFs; suggests avoiding Puppeteer on Bun. Verified via issue tracker, but may have been resolved in later Bun versions.
- [PDFKit with Hono + Bun](https://gist.github.com/mansarip/eb11b66e7dc65cee988155275a17a119) -- single-source gist confirming PDFKit works on Bun
- [Styra DAS Policy Builder](https://docs.styra.com/das/policies/policy-authoring/policy-builder/use-policy-builder) -- commercial product reference for visual Rego builder UX patterns; not directly reusable but validates the template-based approach

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Locked decisions + containerclaw reference provide exact library versions; TanStack Query/Table verified via official docs
- Architecture: HIGH - containerclaw provides proven layout/auth patterns; API endpoints verified from control plane source code; component structure is straightforward App Router
- Pitfalls: HIGH - CORS, SSE auth, cookie security, Docker standalone are well-documented; Rego template generation is MEDIUM (needs validation during implementation)
- Rego templates: MEDIUM - Template-based Rego generation is conceptually sound and validated by Styra's commercial product, but the specific templates need testing against OPA compilation

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (30 days -- stable ecosystem, no major version changes expected)
