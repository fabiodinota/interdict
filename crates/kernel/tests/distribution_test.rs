//! Integration tests for policy distribution and hot-reload (Phase 6 Plan 04).
//!
//! Validates ROADMAP success criteria SC1 (push-based distribution), SC2 (hot-reload
//! without restart), SC3 (hierarchy cascade + per-vendor scoping), delta add/remove,
//! version gap detection, and disconnect resilience.

use std::collections::HashMap;
use std::sync::Arc;

use kernel::config::PolicyEngineConfig;
use kernel::policy::config::{BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection};
use kernel::policy::distribution::proto;
use kernel::policy::distribution::snapshot::{apply_delta, apply_snapshot};
use kernel::policy::hierarchy::{HierarchyConfig, HierarchyResolver, PolicyScope, ScopedPolicy};
use kernel::policy::hot_reload::{PolicySet, PolicySetManager};
use kernel::policy::layer1::regorus::RegorusPool;
use kernel::policy::verdict::{MergedVerdict, PolicyVerdict, VerdictAction};
use kernel::policy::wasm_engine::WasmEngine;

// ── Helpers ───────────────────────────────────────────────────────────

fn test_wasm_engine() -> Arc<WasmEngine> {
    Arc::new(WasmEngine::new(&PolicyEngineConfig::default()).expect("WasmEngine should create"))
}

fn test_hierarchy_config() -> HierarchyConfig {
    HierarchyConfig {
        org_id: "test-org".to_string(),
        dept_id: Some("engineering".to_string()),
        team_id: None,
    }
}

fn make_empty_policy_set(version: u64) -> PolicySet {
    let engine = regorus::Engine::new();
    let pool = Arc::new(RegorusPool::new(&engine, 1));
    let wasm = test_wasm_engine();
    let hierarchy = HierarchyResolver::new(vec![]);

    PolicySet {
        regorus_pool: pool,
        wasm_engine: wasm,
        hierarchy,
        policies: vec![],
        version,
        content_hashes: HashMap::new(),
    }
}

fn make_policy_entry(id: &str, name: &str, rego: &str, fail_mode: i32) -> proto::PolicyEntry {
    proto::PolicyEntry {
        policy_id: id.to_string(),
        name: name.to_string(),
        version: 1,
        wasm_bytes: vec![],
        wasm_hash: format!("hash-{}", id),
        rego_source: rego.to_string(),
        entrypoint: format!("data.interdict.policy.{}.verdict", id),
        scope: Some(proto::PolicyScope {
            org_id: "test-org".to_string(),
            dept_id: String::new(),
            team_id: String::new(),
            vendor_ids: vec![],
        }),
        fail_mode,
    }
}

fn make_scoped_policy_entry(
    id: &str,
    name: &str,
    org: &str,
    dept: &str,
    team: &str,
    vendors: Vec<String>,
) -> proto::PolicyEntry {
    proto::PolicyEntry {
        policy_id: id.to_string(),
        name: name.to_string(),
        version: 1,
        wasm_bytes: vec![],
        wasm_hash: format!("hash-{}", id),
        rego_source: sample_rego(id),
        entrypoint: format!("data.interdict.policy.{}.verdict", id),
        scope: Some(proto::PolicyScope {
            org_id: org.to_string(),
            dept_id: dept.to_string(),
            team_id: team.to_string(),
            vendor_ids: vendors,
        }),
        fail_mode: 0,
    }
}

fn sample_rego(pkg_name: &str) -> String {
    format!(
        r#"package interdict.policy.{}
import rego.v1
default verdict := {{"action": "allow"}}
"#,
        pkg_name
    )
}

fn sample_block_rego(pkg_name: &str, vendor: &str) -> String {
    format!(
        r#"package interdict.policy.{}
import rego.v1
default verdict := {{"action": "allow"}}
verdict := {{"action": "block", "reason": "blocked_by_policy"}} if {{
    input.vendor == "{}"
}}
"#,
        pkg_name, vendor
    )
}

fn make_policy_config(id: &str, name: &str) -> PolicyConfig {
    PolicyConfig {
        id: id.to_string(),
        name: name.to_string(),
        rego_source: Some(format!("policies/{}.rego", id)),
        entrypoint: None,
        fail_mode: FailMode::FailClosed,
        block_response_detail: BlockResponseDetail::Opaque,
        redaction_direction: RedactionDirection::Both,
        background_l2: false,
        enabled: true,
    }
}

fn make_scoped(
    id: &str,
    name: &str,
    org: &str,
    dept: &str,
    team: &str,
    vendors: Vec<&str>,
) -> ScopedPolicy {
    ScopedPolicy {
        config: make_policy_config(id, name),
        scope: PolicyScope {
            org_id: org.to_string(),
            dept_id: dept.to_string(),
            team_id: team.to_string(),
            vendor_ids: vendors.into_iter().map(|s| s.to_string()).collect(),
        },
    }
}

// ── SC1: Push-based distribution — full snapshot updates PolicySet ────

#[tokio::test]
async fn test_sc1_full_snapshot_updates_policy_set() {
    // Start with empty PolicySetManager at version 0
    let manager = PolicySetManager::new(make_empty_policy_set(0));
    assert_eq!(manager.current_version(), 0);

    // Build snapshot with 2 policies (one org-level, one dept-level)
    let entries = vec![
        make_scoped_policy_entry("org_policy", "Org Policy", "acme", "", "", vec![]),
        make_scoped_policy_entry("dept_policy", "Dept Policy", "acme", "legal", "", vec![]),
    ];

    let wasm = test_wasm_engine();
    let hconfig = test_hierarchy_config();

    let policy_set = apply_snapshot(5, &entries, &wasm, &hconfig)
        .await
        .expect("snapshot should succeed");

    // Swap into PolicySetManager
    manager.swap(policy_set);

    // Assert version advanced from 0 to 5
    assert_eq!(manager.current_version(), 5);

    // Assert content_hashes has entries for both policies
    let guard = manager.load();
    assert_eq!(guard.content_hashes.len(), 2);
    assert!(guard.content_hashes.contains_key("org_policy"));
    assert!(guard.content_hashes.contains_key("dept_policy"));

    // Assert load() returns the new version
    assert_eq!(guard.version, 5);
    assert_eq!(guard.policies.len(), 2);
}

// ── SC2: Hot-reload — new policy evaluated without restart ──────────

#[tokio::test]
async fn test_sc2_hot_reload_new_policy_evaluated() {
    // Create initial PolicySet with allow-all Rego policy
    let allow_rego = sample_rego("allow_all");
    let mut allow_engine = regorus::Engine::new();
    allow_engine
        .add_policy("allow_all.rego".to_string(), allow_rego.clone())
        .unwrap();
    let allow_pool = Arc::new(RegorusPool::new(&allow_engine, 2));
    let wasm = test_wasm_engine();

    let initial_set = PolicySet {
        regorus_pool: allow_pool.clone(),
        wasm_engine: wasm.clone(),
        hierarchy: HierarchyResolver::new(vec![]),
        policies: vec![make_policy_config("allow_all", "Allow All")],
        version: 1,
        content_hashes: HashMap::new(),
    };

    let manager = PolicySetManager::new(initial_set);

    // Verify evaluation against initial policy returns Allow
    {
        let guard = manager.load();
        let verdict = guard
            .regorus_pool
            .evaluate(
                r#"{"vendor": "api.openai.com"}"#,
                "data.interdict.policy.allow_all.verdict",
                "allow_all",
                FailMode::FailClosed,
            )
            .await;
        assert_eq!(verdict.action, VerdictAction::Allow);
    }

    // Build new PolicySet with a policy that BLOCKs "api.openai.com"
    let block_rego = sample_block_rego("block_openai", "api.openai.com");
    let mut block_engine = regorus::Engine::new();
    block_engine
        .add_policy("block_openai.rego".to_string(), block_rego)
        .unwrap();
    let block_pool = Arc::new(RegorusPool::new(&block_engine, 2));

    let new_set = PolicySet {
        regorus_pool: block_pool,
        wasm_engine: wasm,
        hierarchy: HierarchyResolver::new(vec![]),
        policies: vec![make_policy_config("block_openai", "Block OpenAI")],
        version: 2,
        content_hashes: HashMap::new(),
    };

    // Swap into PolicySetManager (hot-reload without restart)
    manager.swap(new_set);

    // Load new set and evaluate again
    let guard = manager.load();
    assert_eq!(guard.version, 2);

    let verdict = guard
        .regorus_pool
        .evaluate(
            r#"{"vendor": "api.openai.com"}"#,
            "data.interdict.policy.block_openai.verdict",
            "block_openai",
            FailMode::FailClosed,
        )
        .await;

    // Assert result is now Block — proves SC2
    assert_eq!(verdict.action, VerdictAction::Block);
    assert_eq!(verdict.reason, Some("blocked_by_policy".to_string()));
}

// ── SC3: Hierarchy cascade — org+dept+team with most-restrictive-wins ─

#[test]
fn test_sc3_hierarchy_org_dept_team_cascade() {
    // Create ScopedPolicy entries at three levels
    let policies = vec![
        // Org-level: Allow all traffic
        make_scoped("org_allow", "Org Allow", "acme", "", "", vec![]),
        // Dept-level: Block vendor "risky-ai.com"
        make_scoped(
            "dept_block",
            "Dept Block Risky",
            "acme",
            "legal",
            "",
            vec!["risky-ai.com"],
        ),
        // Team-level: Block vendor "another-ai.com"
        make_scoped(
            "team_block",
            "Team Block Another",
            "acme",
            "legal",
            "litigation",
            vec!["another-ai.com"],
        ),
    ];

    let resolver = HierarchyResolver::new(policies);

    // Test case 1: User in org="acme", dept=None, team=None -> only org policy
    let ctx1 = HierarchyConfig {
        org_id: "acme".to_string(),
        dept_id: None,
        team_id: None,
    };
    let resolved1 = resolver.resolve(&ctx1, "safe-ai.com");
    assert_eq!(resolved1.len(), 1);
    assert_eq!(resolved1[0].id, "org_allow");

    // Test case 2: User in org="acme", dept="legal" -> org + dept policies
    let ctx2 = HierarchyConfig {
        org_id: "acme".to_string(),
        dept_id: Some("legal".to_string()),
        team_id: None,
    };

    // For "risky-ai.com": dept_block applies (vendor-scoped to risky-ai.com)
    let resolved2_risky = resolver.resolve(&ctx2, "risky-ai.com");
    assert_eq!(resolved2_risky.len(), 2); // org_allow + dept_block
    let ids2: Vec<&str> = resolved2_risky.iter().map(|p| p.id.as_str()).collect();
    assert!(ids2.contains(&"org_allow"));
    assert!(ids2.contains(&"dept_block"));

    // For "safe-ai.com": only org_allow (dept_block is scoped to risky-ai.com)
    let resolved2_safe = resolver.resolve(&ctx2, "safe-ai.com");
    assert_eq!(resolved2_safe.len(), 1);
    assert_eq!(resolved2_safe[0].id, "org_allow");

    // Test case 3: User in org="acme", dept="legal", team="litigation" -> all three
    let ctx3 = HierarchyConfig {
        org_id: "acme".to_string(),
        dept_id: Some("legal".to_string()),
        team_id: Some("litigation".to_string()),
    };

    // For "another-ai.com": team_block applies
    let resolved3 = resolver.resolve(&ctx3, "another-ai.com");
    assert_eq!(resolved3.len(), 2); // org_allow + team_block
    let ids3: Vec<&str> = resolved3.iter().map(|p| p.id.as_str()).collect();
    assert!(ids3.contains(&"org_allow"));
    assert!(ids3.contains(&"team_block"));

    // Most-restrictive-wins via MergedVerdict::merge
    // Simulate: org says Allow, dept says Block
    let org_verdict = PolicyVerdict {
        policy_id: "org_allow".to_string(),
        action: VerdictAction::Allow,
        redactions: vec![],
        reason: Some("org allows all".to_string()),
    };
    let dept_verdict = PolicyVerdict {
        policy_id: "dept_block".to_string(),
        action: VerdictAction::Block,
        redactions: vec![],
        reason: Some("dept blocks risky vendor".to_string()),
    };
    let merged = MergedVerdict::merge(vec![org_verdict, dept_verdict]);
    assert_eq!(merged.final_action, VerdictAction::Block);
}

// ── SC3: Per-vendor scoping ─────────────────────────────────────────

#[test]
fn test_sc3_hierarchy_per_vendor_scoping() {
    let policies = vec![
        // Scoped to api.openai.com only
        make_scoped(
            "openai_only",
            "OpenAI Only",
            "acme",
            "",
            "",
            vec!["api.openai.com"],
        ),
        // Scoped to all vendors (empty vendor_ids)
        make_scoped("all_vendors", "All Vendors", "acme", "", "", vec![]),
    ];

    let resolver = HierarchyResolver::new(policies);
    let ctx = HierarchyConfig {
        org_id: "acme".to_string(),
        dept_id: None,
        team_id: None,
    };

    // Policy scoped to api.openai.com should NOT apply to api.anthropic.com
    let anthropic_policies = resolver.resolve(&ctx, "api.anthropic.com");
    assert_eq!(anthropic_policies.len(), 1);
    assert_eq!(anthropic_policies[0].id, "all_vendors");

    // Policy scoped to api.openai.com should apply to api.openai.com
    let openai_policies = resolver.resolve(&ctx, "api.openai.com");
    assert_eq!(openai_policies.len(), 2);
    let ids: Vec<&str> = openai_policies.iter().map(|p| p.id.as_str()).collect();
    assert!(ids.contains(&"openai_only"));
    assert!(ids.contains(&"all_vendors"));
}

// ── Delta: Add policy ───────────────────────────────────────────────

#[tokio::test]
async fn test_delta_add_policy() {
    let wasm = test_wasm_engine();
    let hconfig = test_hierarchy_config();

    // Start with 1 policy
    let initial = apply_snapshot(
        1,
        &[make_policy_entry(
            "pol1",
            "Policy 1",
            &sample_rego("pol1"),
            0,
        )],
        &wasm,
        &hconfig,
    )
    .await
    .unwrap();
    assert_eq!(initial.policies.len(), 1);

    // Delta adds a second policy
    let update = proto::PolicyUpdate {
        version: 2,
        r#type: proto::policy_update::UpdateType::Delta as i32,
        policies: vec![make_policy_entry(
            "pol2",
            "Policy 2",
            &sample_rego("pol2"),
            0,
        )],
        removed_policy_ids: vec![],
    };

    let updated = apply_delta(&initial, &update, &wasm, &hconfig)
        .await
        .expect("delta add should succeed");

    assert_eq!(updated.version, 2);
    assert_eq!(updated.policies.len(), 2);
    assert!(updated.content_hashes.contains_key("pol2"));
}

// ── Delta: Remove policy ────────────────────────────────────────────

#[tokio::test]
async fn test_delta_remove_policy() {
    let wasm = test_wasm_engine();
    let hconfig = test_hierarchy_config();

    // Start with 2 policies
    let initial = apply_snapshot(
        1,
        &[
            make_policy_entry("pol1", "Policy 1", &sample_rego("pol1"), 0),
            make_policy_entry("pol2", "Policy 2", &sample_rego("pol2"), 0),
        ],
        &wasm,
        &hconfig,
    )
    .await
    .unwrap();
    assert_eq!(initial.policies.len(), 2);

    // Delta removes pol1
    let update = proto::PolicyUpdate {
        version: 2,
        r#type: proto::policy_update::UpdateType::Delta as i32,
        policies: vec![],
        removed_policy_ids: vec!["pol1".to_string()],
    };

    let updated = apply_delta(&initial, &update, &wasm, &hconfig)
        .await
        .expect("delta remove should succeed");

    assert_eq!(updated.version, 2);
    assert_eq!(updated.policies.len(), 1);
    assert_eq!(updated.policies[0].id, "pol2");
    assert!(!updated.content_hashes.contains_key("pol1"));
}

// ── Delta: Version gap detection ────────────────────────────────────

#[tokio::test]
async fn test_delta_version_gap_detection() {
    let wasm = test_wasm_engine();
    let hconfig = test_hierarchy_config();

    // Start at version 5
    let initial = apply_snapshot(5, &[], &wasm, &hconfig).await.unwrap();
    assert_eq!(initial.version, 5);

    // Apply delta with version=8 (gap: expected 6, got 8)
    let update = proto::PolicyUpdate {
        version: 8,
        r#type: proto::policy_update::UpdateType::Delta as i32,
        policies: vec![],
        removed_policy_ids: vec![],
    };

    let result = apply_delta(&initial, &update, &wasm, &hconfig).await;
    assert!(result.is_err(), "should return error on version gap");
    let err_msg = format!("{}", result.err().unwrap());
    assert!(
        err_msg.contains("version gap"),
        "Error should mention version gap: {}",
        err_msg
    );
}

// ── Snapshot with Rego sources builds functional RegorusPool ────────

#[tokio::test]
async fn test_snapshot_rebuild_regorus() {
    let wasm = test_wasm_engine();
    let hconfig = test_hierarchy_config();

    // Build snapshot with a real Rego policy that blocks a vendor
    let block_rego = sample_block_rego("block_vendor", "evil-ai.com");
    let entries = vec![proto::PolicyEntry {
        policy_id: "block_vendor".to_string(),
        name: "Block Vendor".to_string(),
        version: 1,
        wasm_bytes: vec![],
        wasm_hash: "hash-block".to_string(),
        rego_source: block_rego,
        entrypoint: "data.interdict.policy.block_vendor.verdict".to_string(),
        scope: Some(proto::PolicyScope {
            org_id: "test-org".to_string(),
            dept_id: String::new(),
            team_id: String::new(),
            vendor_ids: vec![],
        }),
        fail_mode: 0,
    }];

    let policy_set = apply_snapshot(3, &entries, &wasm, &hconfig)
        .await
        .expect("snapshot with rego should succeed");

    // Verify the RegorusPool can actually evaluate the loaded policy
    let verdict = policy_set
        .regorus_pool
        .evaluate(
            r#"{"vendor": "evil-ai.com"}"#,
            "data.interdict.policy.block_vendor.verdict",
            "block_vendor",
            FailMode::FailClosed,
        )
        .await;

    assert_eq!(verdict.action, VerdictAction::Block);
    assert_eq!(verdict.reason, Some("blocked_by_policy".to_string()));

    // Verify allow case
    let allow_verdict = policy_set
        .regorus_pool
        .evaluate(
            r#"{"vendor": "safe-ai.com"}"#,
            "data.interdict.policy.block_vendor.verdict",
            "block_vendor",
            FailMode::FailClosed,
        )
        .await;

    assert_eq!(allow_verdict.action, VerdictAction::Allow);
}

// ── Disconnect: Last-known policies preserved ───────────────────────

#[test]
fn test_disconnect_preserves_last_known() {
    // Create PolicySetManager with a loaded PolicySet at version=10
    let engine = regorus::Engine::new();
    let pool = Arc::new(RegorusPool::new(&engine, 1));
    let wasm = test_wasm_engine();

    let policy_set = PolicySet {
        regorus_pool: pool,
        wasm_engine: wasm,
        hierarchy: HierarchyResolver::new(vec![]),
        policies: vec![make_policy_config("active_policy", "Active Policy")],
        version: 10,
        content_hashes: {
            let mut m = HashMap::new();
            m.insert("active_policy".to_string(), "hash-active".to_string());
            m
        },
    };

    let manager = PolicySetManager::new(policy_set);

    // Simulate "disconnect" by NOT swapping — no new updates arrive
    // In a real disconnect scenario, the distribution client stops receiving
    // updates but the PolicySetManager retains the last-known set.

    // Assert PolicySetManager::load() still returns version=10
    assert_eq!(manager.current_version(), 10);
    let guard = manager.load();
    assert_eq!(guard.version, 10);
    assert_eq!(guard.policies.len(), 1);
    assert_eq!(guard.policies[0].id, "active_policy");
    assert!(guard.content_hashes.contains_key("active_policy"));

    // Multiple loads after "disconnect" still return the same version
    drop(guard);
    assert_eq!(manager.current_version(), 10);
    let guard2 = manager.load();
    assert_eq!(guard2.version, 10);
}
