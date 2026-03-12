# Phase 15: Signing Key Management Dashboard UI - Research

**Researched:** 2026-03-04
**Domain:** Next.js 15 dashboard UI for Ed25519 signing key management
**Confidence:** HIGH

## Summary

Phase 15 adds a dashboard settings page where admins can view signing key status and trigger key rotation. The backend API already exists (built in Phase 10-03): a full Elysia module at `/api/v1/admin/signing-keys` with GET `/` (list keys), POST `/rotate` (trigger rotation), GET `/active` (active key), and GET `/public-keys` (all public keys for verification). The dashboard infrastructure (Next.js 15 with shadcn/ui, TanStack Query, BFF proxy pattern) was established in Phases 9 and 11.

This phase is purely frontend work: a new `/settings/signing-keys` page, a TanStack Query hook for the signing keys API, and UI components to display key status and trigger rotation. No backend changes are needed -- the API is complete and tested.

**Primary recommendation:** Build a single settings page using the exact same patterns as existing dashboard pages (hook + page + components), adding a nav item under a "Settings" section in the sidebar. Use a confirmation dialog before rotation and toast notifications for success/failure.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IDENT-06 | Admin can rotate Ed25519 evidence signing keys without breaking verification of previously signed evidence bundles | Backend fully implemented in Phase 10-03. This phase provides the dashboard UI for the same capability. API endpoints: `GET /admin/signing-keys` (list), `POST /admin/signing-keys/rotate` (rotate), `GET /admin/signing-keys/active` (active key info). |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15 | App router, server components, BFF proxy | Established in Phase 9 |
| @tanstack/react-query | 5.x | Server state management, caching, mutations | All existing hooks use this |
| shadcn/ui + radix-ui | 1.4.x | UI components (Card, Badge, Button, Dialog, Table) | All existing pages use this |
| lucide-react | 0.575.x | Icons | Consistent iconography |
| sonner | 2.x | Toast notifications | All mutations use sonner toasts |
| tailwindcss | 4.x | Styling | Project-wide |
| date-fns | 4.x | Date formatting | Already installed |

### No New Dependencies Required
This phase uses only libraries already in `dashboard/package.json`. No new packages needed.

## Architecture Patterns

### Existing Dashboard File Structure (Follow Exactly)
```
dashboard/src/
├── app/(dashboard)/
│   └── settings/
│       └── signing-keys/
│           └── page.tsx          # Route page component
├── components/
│   └── signing-keys/
│       ├── SigningKeyTable.tsx    # Key list with status badges
│       └── RotateKeyDialog.tsx   # Confirmation dialog for rotation
├── hooks/
│   └── use-signing-keys.ts      # TanStack Query hooks
├── components/layout/
│   └── Sidebar.tsx               # Add "Signing Keys" nav item
└── types/
    └── api.ts                    # Add SigningKeyInfo type
```

### Pattern 1: TanStack Query Hook (Established Pattern)
**What:** All API calls go through custom hooks using `useQuery` for reads and `useMutation` for writes, with query invalidation and toast notifications.
**When to use:** Every API interaction in this phase.
**Example (from use-vendors.ts pattern):**
```typescript
// hooks/use-signing-keys.ts
export function useSigningKeys() {
  return useQuery<ApiResponse<SigningKeyInfo[]>>({
    queryKey: ["signing-keys"],
    queryFn: () => api<ApiResponse<SigningKeyInfo[]>>("/admin/signing-keys"),
  });
}

export function useRotateKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<ApiResponse<RotateResult>>("/admin/signing-keys/rotate", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signing-keys"] });
      toast.success("Signing key rotated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to rotate signing key", { description: error.message });
    },
  });
}
```

### Pattern 2: BFF Proxy API Calls
**What:** All client API calls route through `/api/proxy/[...path]` which injects Bearer token from httpOnly cookie. The proxy prepends `/api/v1/` to the path.
**Key detail:** The api() helper calls `/api/proxy/admin/signing-keys` which the proxy translates to `{CONTROL_PLANE_URL}/api/v1/admin/signing-keys`.
**No changes needed:** The existing BFF proxy handles GET and POST for any path.

### Pattern 3: Page Structure
**What:** Each dashboard page follows the same layout: icon + heading + description text, then content components.
**Example from evidence page:**
```tsx
export default function SigningKeysPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Signing Keys</h1>
        </div>
        <p className="text-muted-foreground">
          Manage Ed25519 evidence signing keys. View active and historical keys,
          and trigger key rotation when needed.
        </p>
      </div>
      {/* Components here */}
    </div>
  );
}
```

### Pattern 4: Sidebar Navigation
**What:** Nav items are defined in a const array in Sidebar.tsx. New items are added to the array.
**Key detail:** The current nav has 10 items in a flat list. For this phase, add a "Signing Keys" item. The `Key` or `KeyRound` icon from lucide-react is appropriate. Route: `/settings/signing-keys`.
**Role consideration:** The signing keys API requires `super_admin` role for list and rotate. The nav item should always be visible (role enforcement is at the API level, not the UI level), matching the existing pattern where all nav items are shown to all authenticated users.

### Pattern 5: Confirmation Dialog Before Destructive Actions
**What:** Use the shadcn Dialog component for confirmation before rotation (same as Phase 9's restore/delete dialogs).
**Example pattern:**
```tsx
<Dialog open={showRotateDialog} onOpenChange={setShowRotateDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Rotate Signing Key</DialogTitle>
      <DialogDescription>
        This will generate a new Ed25519 keypair and retire the current active key.
        Previously signed evidence bundles will remain verifiable.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowRotateDialog(false)}>Cancel</Button>
      <Button onClick={handleRotate} disabled={rotateMutation.isPending}>
        {rotateMutation.isPending ? "Rotating..." : "Rotate Key"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Anti-Patterns to Avoid
- **Do NOT call control plane API directly:** Always go through the BFF proxy via the `api()` helper
- **Do NOT add role-based UI hiding:** Existing pages show all nav items to all users; API enforces roles
- **Do NOT use Dialog AlertDialog:** It's not installed; use Dialog (established in Phase 9 decision)
- **Do NOT add new npm dependencies:** Everything needed is already installed

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API state management | Custom fetch + useState | TanStack Query useQuery/useMutation | Caching, refetch, loading states, error handling |
| Toast notifications | Custom notification system | sonner toast | Already integrated, consistent UX |
| Date formatting | Manual date string manipulation | date-fns format/formatDistanceToNow | Locale-aware, tested |
| Status badges | Custom styled spans | shadcn Badge with variant props | Consistent with existing UI |
| Confirmation dialog | Custom modal | shadcn Dialog | Already used across dashboard |

## Common Pitfalls

### Pitfall 1: Wrong API Path in BFF Proxy
**What goes wrong:** Using `/signing-keys` instead of `/admin/signing-keys` in the api() call.
**Why it happens:** The control plane API is at `/api/v1/admin/signing-keys` and the BFF proxy strips `/api/v1/` automatically by prepending it to the path.
**How to avoid:** The api() helper path must be `/admin/signing-keys` (the proxy adds `/api/v1/` prefix).
**Warning signs:** 404 errors from the proxy.

### Pitfall 2: Forgetting Query Invalidation After Rotation
**What goes wrong:** Key list doesn't update after successful rotation.
**Why it happens:** TanStack Query caches the key list; mutation doesn't auto-refresh.
**How to avoid:** Call `queryClient.invalidateQueries({ queryKey: ["signing-keys"] })` in onSuccess.

### Pitfall 3: Private Key Material in UI
**What goes wrong:** Displaying or logging the private_key_written_to path in the UI.
**Why it happens:** The rotate API response includes `private_key_written_to` field.
**How to avoid:** Only display `key_id` and `public_key_hex` from the rotation response. The `private_key_written_to` is for server-side information only and should not be shown to the user (Invariant #6: no plaintext secrets in logs/UI).

### Pitfall 4: Missing "use client" Directive
**What goes wrong:** React hooks fail in server components.
**Why it happens:** Next.js 15 app router defaults to server components.
**How to avoid:** Add `"use client"` to page.tsx and all components using hooks/state.

## Code Examples

### API Response Shape (from control-plane service)
```typescript
// SigningKeyInfo -- matches control-plane/src/modules/signing-keys/service.ts
interface SigningKeyInfo {
  id: string;
  key_id: string;           // SHA-256(pubkey)[:16] hex (32 chars)
  public_key_hex: string;   // Full Ed25519 public key (64 hex chars)
  is_active: boolean;
  activated_at: string | null;
  retired_at: string | null;
  created_at: string;
}

// RotateResult -- returned by POST /rotate
interface RotateResult {
  key_id: string;
  public_key_hex: string;
  private_key_written_to: string | null;  // DO NOT display in UI
}

// API wraps in: { success: true, data: SigningKeyInfo[] }
// or: { success: true, data: RotateResult }
```

### Key Status Visual Indicators
```tsx
// Active key: green badge
<Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>

// Retired key: secondary/gray badge
<Badge variant="secondary">Retired</Badge>

// Date display using date-fns
import { format, formatDistanceToNow } from "date-fns";
// "Mar 3, 2026" for absolute dates
format(new Date(key.created_at), "MMM d, yyyy");
// "2 hours ago" for relative time
formatDistanceToNow(new Date(key.activated_at), { addSuffix: true });
```

### Key ID Display (Truncated for Readability)
```tsx
// Show first 8 chars of key_id with copy-to-clipboard
<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
  {key.key_id.substring(0, 8)}...
</code>
// Full key_id shown on hover via Tooltip
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct API calls with fetch | BFF proxy + TanStack Query | Phase 9 (established) | All new pages follow BFF pattern |
| Custom state management | TanStack Query v5 | Phase 9 | Caching, optimistic updates built-in |

## Open Questions

None -- all dependencies are built and the patterns are well-established across 10+ existing dashboard pages.

## Sources

### Primary (HIGH confidence)
- `control-plane/src/modules/signing-keys/index.ts` -- Existing API endpoints (4 routes)
- `control-plane/src/modules/signing-keys/service.ts` -- Service types (SigningKeyInfo, RotateResult)
- `control-plane/src/db/schema/auth.ts` -- signing_keys table schema
- `dashboard/src/hooks/use-vendors.ts` -- Reference hook pattern (useQuery + useMutation + toast)
- `dashboard/src/hooks/use-evidence.ts` -- Reference hook pattern (simple useQuery)
- `dashboard/src/app/(dashboard)/evidence/page.tsx` -- Reference page structure
- `dashboard/src/components/layout/Sidebar.tsx` -- Nav item structure
- `dashboard/src/lib/api.ts` -- BFF proxy api() helper
- `dashboard/src/app/api/proxy/[...path]/route.ts` -- BFF proxy implementation
- `dashboard/src/types/api.ts` -- Shared API types
- `.planning/phases/10-saml-sso-security-hardening/10-03-SUMMARY.md` -- Phase 10-03 implementation details

### Secondary (MEDIUM confidence)
- None needed -- all patterns are from existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and used across 10+ pages
- Architecture: HIGH - Exact same patterns as Phase 9/11 pages, no new patterns needed
- Pitfalls: HIGH - Well-known from Phase 9/10/11 implementation history

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable -- no external dependencies changing)