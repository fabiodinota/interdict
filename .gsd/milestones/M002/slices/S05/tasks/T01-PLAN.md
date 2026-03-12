# T01: 11-advanced-dashboard-views 01

**Slice:** S05 — **Milestone:** M002

## Description

Evidence Verification UI and API -- enables auditors to independently verify evidence bundle integrity through a dedicated dashboard page with three-step cryptographic verification, plus inline quick-verify on audit trail records.

Purpose: Satisfies DASH-07 -- auditors need to independently verify the tamper-evident evidence chain without trusting the system that created it.
Output: Control plane verification endpoints + Evidence Verification dashboard page with batch and single-bundle verification + inline quick-verify button on audit trail rows. Also adds all Phase 11 shared types and sidebar nav items so subsequent plans (02-04) can run in parallel.

## Must-Haves

- [ ] "Auditor can select evidence bundles and verify hash chain integrity with pass/fail result"
- [ ] "Auditor can verify Ed25519 signature validity for any evidence bundle"
- [ ] "Auditor can verify Merkle proof inclusion against hourly root"
- [ ] "Batch verification returns per-bundle summary with overall pass/fail"
- [ ] "Single bundle detail view shows expandable raw hashes and signatures"
- [ ] "Auditor can quick-verify a single bundle directly from the audit trail table"

## Files

- `dashboard/src/components/layout/Sidebar.tsx`
- `dashboard/src/types/api.ts`
- `dashboard/src/app/(dashboard)/evidence/page.tsx`
- `dashboard/src/components/evidence/VerificationStepper.tsx`
- `dashboard/src/components/evidence/BatchVerifyTable.tsx`
- `dashboard/src/components/evidence/BundleDetailPanel.tsx`
- `dashboard/src/components/audit/AuditTable.tsx`
- `dashboard/src/hooks/use-evidence.ts`
- `control-plane/src/modules/evidence/index.ts`
- `control-plane/src/modules/evidence/service.ts`
- `control-plane/src/modules/evidence/model.ts`
- `control-plane/src/index.ts`
