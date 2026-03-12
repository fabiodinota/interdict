# T01: 15-signing-key-management-dashboard-ui 01

**Slice:** S09 — **Milestone:** M002

## Description

Add a dashboard settings page for signing key management so admins can view key status and trigger rotation from the UI instead of direct API calls.

Purpose: Close the last v1.1 gap -- IDENT-06 requires admin-facing key rotation capability, and while the backend API exists (Phase 10-03), there is no dashboard UI for it.
Output: A /settings/signing-keys page with key list, status badges, and rotation dialog.

## Must-Haves

- [ ] "Admin can view current and historical signing keys on the dashboard"
- [ ] "Admin can trigger key rotation from the dashboard and see the new key appear"
- [ ] "Key status (active vs retired) is displayed with clear visual indicators"
- [ ] "Signing Keys page is accessible from sidebar navigation"

## Files

- `dashboard/src/types/api.ts`
- `dashboard/src/hooks/use-signing-keys.ts`
- `dashboard/src/components/layout/Sidebar.tsx`
- `dashboard/src/components/signing-keys/SigningKeyTable.tsx`
- `dashboard/src/components/signing-keys/RotateKeyDialog.tsx`
- `dashboard/src/app/(dashboard)/settings/signing-keys/page.tsx`
