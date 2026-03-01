//! ArcSwap-based PolicySet manager for atomic hot-reload of policy sets.
//!
//! Provides lock-free read access for the data-plane hot path while allowing
//! the distribution client to atomically swap in new policy sets from the
//! control plane. In-flight requests finish with the old policy set; the next
//! request picks up the new one automatically.
//!
//! Uses `arc_swap::ArcSwap` for zero-downtime reads: readers never block,
//! writers do a single atomic pointer swap.

use std::collections::HashMap;
use std::sync::Arc;

use arc_swap::{ArcSwap, Guard};

use crate::policy::config::PolicyConfig;
use crate::policy::hierarchy::HierarchyResolver;
use crate::policy::layer1::regorus::RegorusPool;
use crate::policy::wasm_engine::WasmEngine;

/// A complete, immutable snapshot of all active policies.
///
/// Built by the distribution client when a policy update arrives from the
/// control plane. Contains everything the kernel needs for policy evaluation:
/// Rego engine pool, Wasm engine, hierarchy resolver, and policy configs.
pub struct PolicySet {
    /// Pre-loaded Regorus engine pool built from updated Rego sources.
    pub regorus_pool: Arc<RegorusPool>,
    /// Shared Wasmtime engine (not rebuilt per update, config-stable).
    pub wasm_engine: Arc<WasmEngine>,
    /// Hierarchy resolver built from policy scope data.
    pub hierarchy: HierarchyResolver,
    /// Full list of policy configs (hierarchy already resolved for this kernel's scope).
    pub policies: Vec<PolicyConfig>,
    /// Monotonic version counter from the control plane.
    pub version: u64,
    /// Integrity map: policy_id -> SHA-256 hash of compiled Wasm bytes.
    pub content_hashes: HashMap<String, String>,
}

/// Lock-free policy set manager using ArcSwap for atomic swaps.
///
/// The hot path calls `load()` which returns a `Guard` — a lightweight
/// borrow that avoids full `Arc` clone overhead. The distribution client
/// calls `swap()` to atomically install a new policy set.
pub struct PolicySetManager {
    inner: Arc<ArcSwap<PolicySet>>,
}

impl PolicySetManager {
    /// Create a new manager with an initial policy set.
    pub fn new(initial: PolicySet) -> Self {
        Self {
            inner: Arc::new(ArcSwap::from_pointee(initial)),
        }
    }

    /// Lock-free read of the current policy set.
    ///
    /// Returns a `Guard` that dereferences to `Arc<PolicySet>`. This is
    /// cheaper than a full `Arc::clone` and is the recommended read path
    /// for the hot loop.
    pub fn load(&self) -> Guard<Arc<PolicySet>> {
        self.inner.load()
    }

    /// Atomically replace the current policy set with a new one.
    ///
    /// Any in-flight requests holding a reference to the old set will
    /// continue to use it. The next call to `load()` returns the new set.
    pub fn swap(&self, new: PolicySet) {
        self.inner.store(Arc::new(new));
    }

    /// Read the current policy version without loading the full set.
    pub fn current_version(&self) -> u64 {
        self.inner.load().version
    }
}

impl Clone for PolicySetManager {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::hierarchy::HierarchyResolver;

    fn make_policy_set(version: u64) -> PolicySet {
        // Minimal Rego engine for testing
        let engine = regorus::Engine::new();
        let pool = Arc::new(RegorusPool::new(&engine, 1));
        let wasm = Arc::new(
            WasmEngine::new(&crate::config::PolicyEngineConfig::default())
                .expect("WasmEngine should create"),
        );
        let hierarchy = HierarchyResolver::new(vec![]);
        let mut hashes = HashMap::new();
        hashes.insert(format!("policy-v{}", version), format!("hash-v{}", version));

        PolicySet {
            regorus_pool: pool,
            wasm_engine: wasm,
            hierarchy,
            policies: vec![],
            version,
            content_hashes: hashes,
        }
    }

    #[test]
    fn test_policy_set_new_creates_valid_set() {
        let ps = make_policy_set(1);
        assert_eq!(ps.version, 1);
        assert!(ps.content_hashes.contains_key("policy-v1"));
    }

    #[test]
    fn test_manager_load_returns_current_snapshot() {
        let manager = PolicySetManager::new(make_policy_set(1));
        let guard = manager.load();
        assert_eq!(guard.version, 1);
    }

    #[test]
    fn test_manager_swap_atomically_replaces_set() {
        let manager = PolicySetManager::new(make_policy_set(1));

        // Verify initial version
        assert_eq!(manager.current_version(), 1);

        // Swap to version 2
        manager.swap(make_policy_set(2));

        // Subsequent load returns new version
        let guard = manager.load();
        assert_eq!(guard.version, 2);
        assert!(guard.content_hashes.contains_key("policy-v2"));
    }

    #[test]
    fn test_manager_current_version_reads_without_full_load() {
        let manager = PolicySetManager::new(make_policy_set(42));
        assert_eq!(manager.current_version(), 42);
    }

    #[test]
    fn test_manager_clone_shares_state() {
        let manager1 = PolicySetManager::new(make_policy_set(1));
        let manager2 = manager1.clone();

        // Swap via clone
        manager2.swap(make_policy_set(5));

        // Original sees the update
        assert_eq!(manager1.current_version(), 5);
    }

    #[test]
    fn test_old_guard_survives_swap() {
        let manager = PolicySetManager::new(make_policy_set(1));

        // Take a reference to the old set
        let old_guard = manager.load();
        assert_eq!(old_guard.version, 1);

        // Swap to new version
        manager.swap(make_policy_set(2));

        // Old guard still valid (Arc keeps it alive)
        assert_eq!(old_guard.version, 1);

        // New load sees the update
        let new_guard = manager.load();
        assert_eq!(new_guard.version, 2);
    }
}
