# Deferred Items - Phase 04

## Pre-existing Issues (Out of Scope)

### 1. Evidence-collector S3 type mismatch
- **File:** `crates/evidence-collector/src/storage/s3.rs:89`
- **Error:** `ObjectLockMode::Compliance` used where `ObjectLockRetentionMode` expected
- **Impact:** evidence-collector crate fails to compile
- **Root cause:** AWS SDK API change between versions
- **Discovered during:** 04-03 workspace test run
- **Action:** Fix in evidence-collector plan (04-02 or 04-04)
