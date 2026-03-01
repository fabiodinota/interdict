//! Snapshot and delta processing for policy distribution updates.
//!
//! Converts protobuf `PolicyUpdate` messages into `PolicySet` instances
//! that can be atomically swapped via `PolicySetManager`.
//!
//! - `apply_snapshot`: Builds a complete PolicySet from a full list of PolicyEntry protos
//! - `apply_delta`: Adds/removes policies from an existing PolicySet

use std::collections::HashMap;
use std::sync::Arc;

use crate::policy::config::{BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection};
use crate::policy::distribution::proto;
use crate::policy::hierarchy::{HierarchyConfig, HierarchyResolver, PolicyScope, ScopedPolicy};
use crate::policy::hot_reload::PolicySet;
use crate::policy::layer1::regorus::RegorusPool;
use crate::policy::wasm_engine::WasmEngine;

/// Convert a proto FailMode enum to the config FailMode.
fn proto_fail_mode_to_config(mode: i32) -> FailMode {
    match proto::policy_entry::FailMode::try_from(mode) {
        Ok(proto::policy_entry::FailMode::FailOpen) => FailMode::FailOpen,
        _ => FailMode::FailClosed, // Default to fail-closed (security-first)
    }
}

/// Convert a proto PolicyEntry to a ScopedPolicy + PolicyConfig pair.
fn entry_to_scoped_policy(entry: &proto::PolicyEntry) -> ScopedPolicy {
    let scope = entry.scope.as_ref().map_or_else(
        || PolicyScope {
            org_id: String::new(),
            dept_id: String::new(),
            team_id: String::new(),
            vendor_ids: vec![],
        },
        |s| PolicyScope {
            org_id: s.org_id.clone(),
            dept_id: s.dept_id.clone(),
            team_id: s.team_id.clone(),
            vendor_ids: s.vendor_ids.clone(),
        },
    );

    let config = PolicyConfig {
        id: entry.policy_id.clone(),
        name: entry.name.clone(),
        rego_source: if entry.rego_source.is_empty() {
            None
        } else {
            Some(entry.rego_source.clone())
        },
        fail_mode: proto_fail_mode_to_config(entry.fail_mode),
        block_response_detail: BlockResponseDetail::Opaque,
        redaction_direction: RedactionDirection::Both,
        background_l2: false,
        enabled: true,
    };

    ScopedPolicy { config, scope }
}

/// Build a new RegorusPool from policy entries that have Rego source.
///
/// Uses `tokio::task::spawn_blocking` because Regorus operations are
/// CPU-bound (Pitfall 4 from research).
async fn build_regorus_pool(entries: &[proto::PolicyEntry]) -> anyhow::Result<Arc<RegorusPool>> {
    let mut template = regorus::Engine::new();

    for entry in entries {
        if !entry.rego_source.is_empty() {
            let filename = format!("policy_{}.rego", entry.policy_id);
            template.add_policy(filename, entry.rego_source.clone())?;
        }
    }

    // Clone for spawn_blocking (CPU-bound work off the async runtime)
    let pool = tokio::task::spawn_blocking(move || RegorusPool::new(&template, 4)).await?;

    Ok(Arc::new(pool))
}

/// Build a PolicySet from a full snapshot of policy entries.
///
/// Called on initial connection and when a full resync is needed
/// (e.g., after a version gap in delta updates).
pub async fn apply_snapshot(
    version: u64,
    entries: &[proto::PolicyEntry],
    wasm_engine: &Arc<WasmEngine>,
    _hierarchy_config: &HierarchyConfig,
) -> anyhow::Result<PolicySet> {
    // Convert all entries to ScopedPolicy
    let scoped_policies: Vec<ScopedPolicy> = entries.iter().map(entry_to_scoped_policy).collect();

    // Build hierarchy resolver from scoped policies
    let hierarchy = HierarchyResolver::new(scoped_policies.clone());

    // Extract flat policy configs
    let policies: Vec<PolicyConfig> = scoped_policies.iter().map(|sp| sp.config.clone()).collect();

    // Build Regorus pool from entries with Rego source
    let regorus_pool = build_regorus_pool(entries).await?;

    // Build content hashes map
    let content_hashes: HashMap<String, String> = entries
        .iter()
        .filter(|e| !e.wasm_hash.is_empty())
        .map(|e| (e.policy_id.clone(), e.wasm_hash.clone()))
        .collect();

    Ok(PolicySet {
        regorus_pool,
        wasm_engine: Arc::clone(wasm_engine),
        hierarchy,
        policies,
        version,
        content_hashes,
    })
}

/// Apply a delta update to an existing PolicySet.
///
/// Adds new policies and removes specified policy IDs from the existing set.
/// Returns an error if a version gap is detected (update.version > current.version + 1),
/// indicating that a full snapshot re-sync is needed.
pub async fn apply_delta(
    current: &PolicySet,
    update: &proto::PolicyUpdate,
    wasm_engine: &Arc<WasmEngine>,
    hierarchy_config: &HierarchyConfig,
) -> anyhow::Result<PolicySet> {
    // Detect version gap
    if update.version > current.version + 1 {
        anyhow::bail!(
            "version gap detected: current={}, received={}; full snapshot re-sync required",
            current.version,
            update.version
        );
    }

    // Start from current policies
    let mut scoped_policies: Vec<ScopedPolicy> = current
        .policies
        .iter()
        .map(|config| {
            // Reconstruct ScopedPolicy from existing config (best-effort scope)
            ScopedPolicy {
                config: config.clone(),
                scope: PolicyScope {
                    org_id: hierarchy_config.org_id.clone(),
                    dept_id: hierarchy_config.dept_id.clone().unwrap_or_default(),
                    team_id: hierarchy_config.team_id.clone().unwrap_or_default(),
                    vendor_ids: vec![],
                },
            }
        })
        .collect();

    // Remove policies listed in removed_policy_ids
    let removed_ids: std::collections::HashSet<&str> = update
        .removed_policy_ids
        .iter()
        .map(|s| s.as_str())
        .collect();
    scoped_policies.retain(|sp| !removed_ids.contains(sp.config.id.as_str()));

    // Add new policies from the update
    for entry in &update.policies {
        // Remove any existing policy with the same ID (update replaces)
        scoped_policies.retain(|sp| sp.config.id != entry.policy_id);
        scoped_policies.push(entry_to_scoped_policy(entry));
    }

    // Collect all entries (new + existing) for Regorus pool rebuild
    // For the delta, we need to rebuild the pool from all current Rego sources
    let mut all_proto_entries: Vec<proto::PolicyEntry> = Vec::new();
    for sp in &scoped_policies {
        if let Some(ref rego_source) = sp.config.rego_source {
            all_proto_entries.push(proto::PolicyEntry {
                policy_id: sp.config.id.clone(),
                name: sp.config.name.clone(),
                version: 0,
                wasm_bytes: vec![],
                wasm_hash: String::new(),
                rego_source: rego_source.clone(),
                entrypoint: String::new(),
                scope: None,
                fail_mode: 0,
            });
        }
    }
    // Also add the new entries from the update (they have the real rego source)
    for entry in &update.policies {
        if !entry.rego_source.is_empty() {
            // Remove duplicate from all_proto_entries (prefer update's version)
            all_proto_entries.retain(|e| e.policy_id != entry.policy_id);
            all_proto_entries.push(entry.clone());
        }
    }

    let hierarchy = HierarchyResolver::new(scoped_policies.clone());
    let policies: Vec<PolicyConfig> = scoped_policies.iter().map(|sp| sp.config.clone()).collect();
    let regorus_pool = build_regorus_pool(&all_proto_entries).await?;

    // Merge content hashes: keep existing, add new, remove removed
    let mut content_hashes = current.content_hashes.clone();
    for id in &update.removed_policy_ids {
        content_hashes.remove(id);
    }
    for entry in &update.policies {
        if !entry.wasm_hash.is_empty() {
            content_hashes.insert(entry.policy_id.clone(), entry.wasm_hash.clone());
        }
    }

    Ok(PolicySet {
        regorus_pool,
        wasm_engine: Arc::clone(wasm_engine),
        hierarchy,
        policies,
        version: update.version,
        content_hashes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_wasm_engine() -> Arc<WasmEngine> {
        Arc::new(
            WasmEngine::new(&crate::config::PolicyEngineConfig::default())
                .expect("WasmEngine should create"),
        )
    }

    fn test_hierarchy_config() -> HierarchyConfig {
        HierarchyConfig {
            org_id: "test-org".to_string(),
            dept_id: Some("engineering".to_string()),
            team_id: None,
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

    fn sample_rego(pkg_name: &str) -> String {
        format!(
            r#"package interdict.policy.{}
import rego.v1
default verdict := {{"action": "allow"}}
"#,
            pkg_name
        )
    }

    #[tokio::test]
    async fn test_apply_snapshot_builds_policy_set() {
        let wasm = test_wasm_engine();
        let hconfig = test_hierarchy_config();

        let entries = vec![
            make_policy_entry("pol1", "Policy 1", &sample_rego("pol1"), 0),
            make_policy_entry("pol2", "Policy 2", &sample_rego("pol2"), 1),
        ];

        let policy_set = apply_snapshot(5, &entries, &wasm, &hconfig)
            .await
            .expect("snapshot should succeed");

        assert_eq!(policy_set.version, 5);
        assert_eq!(policy_set.policies.len(), 2);
        assert_eq!(policy_set.content_hashes.len(), 2);
        assert!(policy_set.content_hashes.contains_key("pol1"));
        assert!(policy_set.content_hashes.contains_key("pol2"));
    }

    #[tokio::test]
    async fn test_apply_snapshot_fail_mode_mapping() {
        let wasm = test_wasm_engine();
        let hconfig = test_hierarchy_config();

        let entries = vec![
            make_policy_entry("closed", "Fail Closed", &sample_rego("closed"), 0),
            make_policy_entry("open", "Fail Open", &sample_rego("open"), 1),
        ];

        let policy_set = apply_snapshot(1, &entries, &wasm, &hconfig)
            .await
            .expect("snapshot should succeed");

        let closed_policy = policy_set
            .policies
            .iter()
            .find(|p| p.id == "closed")
            .unwrap();
        assert_eq!(closed_policy.fail_mode, FailMode::FailClosed);

        let open_policy = policy_set.policies.iter().find(|p| p.id == "open").unwrap();
        assert_eq!(open_policy.fail_mode, FailMode::FailOpen);
    }

    #[tokio::test]
    async fn test_apply_snapshot_empty_entries() {
        let wasm = test_wasm_engine();
        let hconfig = test_hierarchy_config();

        let policy_set = apply_snapshot(0, &[], &wasm, &hconfig)
            .await
            .expect("empty snapshot should succeed");

        assert_eq!(policy_set.version, 0);
        assert!(policy_set.policies.is_empty());
        assert!(policy_set.content_hashes.is_empty());
    }

    #[tokio::test]
    async fn test_apply_delta_adds_policies() {
        let wasm = test_wasm_engine();
        let hconfig = test_hierarchy_config();

        // Start with one policy
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
            .expect("delta should succeed");

        assert_eq!(updated.version, 2);
        assert_eq!(updated.policies.len(), 2);
        assert!(updated.content_hashes.contains_key("pol2"));
    }

    #[tokio::test]
    async fn test_apply_delta_removes_policies() {
        let wasm = test_wasm_engine();
        let hconfig = test_hierarchy_config();

        // Start with two policies
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
            .expect("delta should succeed");

        assert_eq!(updated.version, 2);
        assert_eq!(updated.policies.len(), 1);
        assert_eq!(updated.policies[0].id, "pol2");
        assert!(!updated.content_hashes.contains_key("pol1"));
    }

    #[tokio::test]
    async fn test_apply_delta_detects_version_gap() {
        let wasm = test_wasm_engine();
        let hconfig = test_hierarchy_config();

        let initial = apply_snapshot(1, &[], &wasm, &hconfig).await.unwrap();

        // Version gap: current=1, received=5 (> 1+1)
        let update = proto::PolicyUpdate {
            version: 5,
            r#type: proto::policy_update::UpdateType::Delta as i32,
            policies: vec![],
            removed_policy_ids: vec![],
        };

        let result = apply_delta(&initial, &update, &wasm, &hconfig).await;
        assert!(result.is_err(), "should return error on version gap");
        let err_msg = format!("{}", result.as_ref().err().unwrap());
        assert!(
            err_msg.contains("version gap"),
            "Error should mention version gap: {}",
            err_msg
        );
    }

    #[tokio::test]
    async fn test_apply_delta_replaces_existing_policy() {
        let wasm = test_wasm_engine();
        let hconfig = test_hierarchy_config();

        let initial = apply_snapshot(
            1,
            &[make_policy_entry(
                "pol1",
                "Old Policy 1",
                &sample_rego("pol1"),
                0,
            )],
            &wasm,
            &hconfig,
        )
        .await
        .unwrap();

        // Delta updates pol1 with new name/content
        let update = proto::PolicyUpdate {
            version: 2,
            r#type: proto::policy_update::UpdateType::Delta as i32,
            policies: vec![make_policy_entry(
                "pol1",
                "New Policy 1",
                &sample_rego("pol1"),
                1,
            )],
            removed_policy_ids: vec![],
        };

        let updated = apply_delta(&initial, &update, &wasm, &hconfig)
            .await
            .expect("delta should succeed");

        assert_eq!(updated.version, 2);
        assert_eq!(updated.policies.len(), 1);
        assert_eq!(updated.policies[0].name, "New Policy 1");
        assert_eq!(updated.policies[0].fail_mode, FailMode::FailOpen);
    }

    #[test]
    fn test_proto_fail_mode_mapping() {
        assert_eq!(proto_fail_mode_to_config(0), FailMode::FailClosed);
        assert_eq!(proto_fail_mode_to_config(1), FailMode::FailOpen);
        assert_eq!(proto_fail_mode_to_config(99), FailMode::FailClosed); // Unknown defaults to closed
    }

    #[test]
    fn test_entry_to_scoped_policy_with_scope() {
        let entry = make_policy_entry("test", "Test Policy", "some_rego", 0);
        let sp = entry_to_scoped_policy(&entry);

        assert_eq!(sp.config.id, "test");
        assert_eq!(sp.config.name, "Test Policy");
        assert_eq!(sp.scope.org_id, "test-org");
        assert!(sp.config.enabled);
    }

    #[test]
    fn test_entry_to_scoped_policy_without_scope() {
        let entry = proto::PolicyEntry {
            policy_id: "test".to_string(),
            name: "Test".to_string(),
            version: 1,
            wasm_bytes: vec![],
            wasm_hash: String::new(),
            rego_source: String::new(),
            entrypoint: String::new(),
            scope: None,
            fail_mode: 0,
        };
        let sp = entry_to_scoped_policy(&entry);

        assert_eq!(sp.config.id, "test");
        assert!(sp.scope.org_id.is_empty());
        assert!(sp.config.rego_source.is_none());
    }
}
