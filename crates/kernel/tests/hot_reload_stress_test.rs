//! Hot-reload stress test: verify PolicySetManager handles concurrent readers during swap.
//!
//! Validates that ArcSwap-based PolicySetManager provides lock-free reads
//! and atomic swaps under heavy concurrency without panics or invalid state.

use std::collections::HashMap;
use std::sync::Arc;

use kernel::config::PolicyEngineConfig;
use kernel::policy::hierarchy::HierarchyResolver;
use kernel::policy::hot_reload::{PolicySet, PolicySetManager};
use kernel::policy::layer1::regorus::RegorusPool;
use kernel::policy::wasm_engine::WasmEngine;

fn make_policy_set(version: u64) -> PolicySet {
    let engine = regorus::Engine::new();
    let pool = Arc::new(RegorusPool::new(&engine, 1));
    let wasm = Arc::new(
        WasmEngine::new(&PolicyEngineConfig::default()).expect("WasmEngine should create"),
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

// ── 50 concurrent readers + swap mid-flight ─────────────────────────

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_50_concurrent_readers_with_mid_flight_swap() {
    let manager = Arc::new(PolicySetManager::new(make_policy_set(1)));
    let barrier = Arc::new(tokio::sync::Barrier::new(51)); // 50 readers + 1 swapper

    let mut handles = Vec::with_capacity(50);

    // Spawn 50 reader tasks
    for _ in 0..50 {
        let mgr = manager.clone();
        let bar = barrier.clone();
        handles.push(tokio::spawn(async move {
            // Wait for all tasks to be ready
            bar.wait().await;

            // Perform multiple loads to increase chance of observing the swap
            let mut versions_seen = Vec::new();
            for _ in 0..100 {
                let guard = mgr.load();
                let v = guard.version;
                versions_seen.push(v);

                // Verify the version is always valid (1 or 2)
                assert!(v == 1 || v == 2, "version should be 1 or 2, got {}", v);

                // Verify content_hashes is consistent with version
                let expected_key = format!("policy-v{}", v);
                assert!(
                    guard.content_hashes.contains_key(&expected_key),
                    "content_hashes should contain key for version {}",
                    v
                );

                // Small yield to interleave with swap
                tokio::task::yield_now().await;
            }

            versions_seen
        }));
    }

    // Swapper task: wait for barrier then swap
    let mgr = manager.clone();
    let swap_handle = tokio::spawn(async move {
        barrier.wait().await;

        // Give readers a few iterations before swapping
        tokio::task::yield_now().await;
        mgr.swap(make_policy_set(2));
    });

    // Wait for swap to complete
    swap_handle.await.expect("swap task should not panic");

    // Collect reader results
    let mut any_saw_v1 = false;
    let mut any_saw_v2 = false;
    for handle in handles {
        let versions = handle.await.expect("reader task should not panic");
        if versions.contains(&1) {
            any_saw_v1 = true;
        }
        if versions.contains(&2) {
            any_saw_v2 = true;
        }
    }

    // At minimum, version 2 must be visible after swap completes
    assert!(any_saw_v2, "at least one reader should see version 2");

    // Final state must be version 2
    assert_eq!(manager.current_version(), 2);

    // Note: any_saw_v1 may or may not be true depending on timing.
    // We do not assert it because the swap may happen before any reader runs.
    let _ = any_saw_v1;
}

// ── Rapid successive swaps ──────────────────────────────────────────

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_100_rapid_successive_swaps_always_valid() {
    let manager = Arc::new(PolicySetManager::new(make_policy_set(0)));
    let reader_count = 10;
    let swap_count = 100u64;

    // Shared flag to signal readers to stop
    let done = Arc::new(std::sync::atomic::AtomicBool::new(false));

    // Spawn reader tasks that continuously load and validate
    let mut reader_handles = Vec::with_capacity(reader_count);
    for _ in 0..reader_count {
        let mgr = manager.clone();
        let done_flag = done.clone();
        reader_handles.push(tokio::spawn(async move {
            let mut read_count = 0u64;
            while !done_flag.load(std::sync::atomic::Ordering::Relaxed) {
                let guard = mgr.load();
                let v = guard.version;

                // Version must be in valid range [0, swap_count]
                assert!(
                    v <= swap_count,
                    "version {} exceeds max expected {}",
                    v,
                    swap_count
                );

                // Content hashes must be consistent with version
                let expected_key = format!("policy-v{}", v);
                assert!(
                    guard.content_hashes.contains_key(&expected_key),
                    "content_hashes missing key for version {}",
                    v
                );

                read_count += 1;
                tokio::task::yield_now().await;
            }
            read_count
        }));
    }

    // Perform 100 rapid swaps
    for v in 1..=swap_count {
        manager.swap(make_policy_set(v));
        // Yield occasionally to let readers interleave
        if v % 10 == 0 {
            tokio::task::yield_now().await;
        }
    }

    // Signal readers to stop
    done.store(true, std::sync::atomic::Ordering::Relaxed);

    // Collect reader results
    let mut total_reads = 0u64;
    for handle in reader_handles {
        let count = handle.await.expect("reader task should not panic");
        total_reads += count;
    }

    // Final version must be the last swapped
    assert_eq!(manager.current_version(), swap_count);

    // Readers should have performed at least some reads
    assert!(
        total_reads > 0,
        "readers should have performed at least one read"
    );
}

// ── Old guard survives swap under concurrency ───────────────────────

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_old_guard_valid_after_concurrent_swaps() {
    let manager = Arc::new(PolicySetManager::new(make_policy_set(1)));

    // Take a reference to the initial policy set
    let old_guard = manager.load();
    assert_eq!(old_guard.version, 1);

    // Swap many times in another task
    let mgr = manager.clone();
    let swap_handle = tokio::spawn(async move {
        for v in 2..=50 {
            mgr.swap(make_policy_set(v));
        }
    });

    swap_handle.await.expect("swap task should not panic");

    // Old guard must still be valid (Arc keeps it alive)
    assert_eq!(old_guard.version, 1);
    assert!(old_guard.content_hashes.contains_key("policy-v1"));

    // New load sees the latest version
    let new_guard = manager.load();
    assert_eq!(new_guard.version, 50);
}
