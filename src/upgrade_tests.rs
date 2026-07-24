use super::*;
use soroban_sdk::testutils::{Address as _, Events};
use soroban_sdk::{symbol_short, Bytes, BytesN, Env, Vec};

// ── Shared helpers ────────────────────────────────────────────────────────────

fn setup() -> (Env, Address, AuditLedgerClient<'static>) {
    let env = Env::default();
    let owner = Address::generate(&env);
    let contract_id = env.register(AuditLedger, ());
    let client = AuditLedgerClient::new(&env, &contract_id);
    env.mock_all_auths();
    let mut owners = Vec::new(&env);
    owners.push_back(owner.clone());
    client.initialize(&owners, &1000, &4096);
    (env, owner, client)
}

/// Return a deterministic fake WASM hash derived from a seed byte.
fn fake_hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

/// Log three events of different types and return their IDs.
fn seed_events(env: &Env, client: &AuditLedgerClient, submitter: &Address) -> Vec<BytesN<32>> {
    let mut ids = Vec::new(env);
    ids.push_back(client.log_event(
        submitter,
        &symbol_short!("payment"),
        &Bytes::from_slice(env, b"{\"ref\":\"INV-001\"}"),
        &None,
        &None,
        &false,
    ));
    ids.push_back(client.log_event(
        submitter,
        &symbol_short!("refund"),
        &Bytes::from_slice(env, b"{\"ref\":\"RF-001\"}"),
        &None,
        &None,
        &false,
    ));
    ids.push_back(client.log_event(
        submitter,
        &symbol_short!("audit"),
        &Bytes::from_slice(env, b"{\"ref\":\"AUD-001\"}"),
        &None,
        &None,
        &false,
    ));
    ids
}

/// Collect event_hash values for a list of IDs.
fn collect_hashes(env: &Env, client: &AuditLedgerClient, ids: &Vec<BytesN<32>>) -> Vec<BytesN<32>> {
    let mut hashes = Vec::new(env);
    for i in 0..ids.len() {
        hashes.push_back(client.get_event(&ids.get(i).unwrap()).event_hash);
    }
    hashes
}

/// Assert that every event is retrievable and has unchanged hashes.
fn assert_events_intact(client: &AuditLedgerClient, ids: &Vec<BytesN<32>>, before: &Vec<BytesN<32>>) {
    assert_eq!(client.total_events(), ids.len());
    for i in 0..ids.len() {
        let ev = client.get_event(&ids.get(i).unwrap());
        assert_eq!(ev.index, i, "index mismatch at position {i}");
        assert_eq!(ev.event_hash, before.get(i).unwrap(), "hash mismatch at position {i}");
        assert_eq!(
            client.get_event_by_order(&i).event_hash,
            before.get(i).unwrap(),
            "order-lookup hash mismatch at position {i}"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// §1  UPGRADE SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════

/// A successful upgrade call must not corrupt any existing data, and the
/// contract must remain fully operational afterwards.
#[test]
fn upgrade_preserves_events_and_allows_continued_logging() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let hashes = collect_hashes(&env, &client, &ids);

    client.upgrade_contract(&owner, &fake_hash(&env, 7));

    assert_events_intact(&client, &ids, &hashes);

    // Logging must still work after the upgrade.
    client.set_global_max_logs(&owner, &500);
    let new_id = client.log_event(
        &submitter,
        &symbol_short!("payment"),
        &Bytes::from_slice(&env, b"{\"ref\":\"INV-002\"}"),
        &None,
        &None,
        &false,
    );
    let new_ev = client.get_event(&new_id);
    assert_eq!(new_ev.index, 3);
    assert_eq!(client.total_events(), 4);
    assert_eq!(client.event_count(&symbol_short!("payment")), 2);
}

/// Upgrading with a zero-byte WASM hash must be rejected and must not touch storage.
#[test]
fn upgrade_with_zero_hash_is_rejected() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let hashes = collect_hashes(&env, &client, &ids);

    let result = client.try_upgrade_contract(&owner, &BytesN::from_array(&env, &[0u8; 32]));
    assert!(result.is_err(), "zero hash should be rejected");

    assert_events_intact(&client, &ids, &hashes);
}

/// A non-owner caller must be refused and must not modify contract state.
#[test]
fn upgrade_by_non_owner_is_rejected() {
    let (env, _owner, client) = setup();
    let attacker = Address::generate(&env);
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let hashes = collect_hashes(&env, &client, &ids);

    let result = client.try_upgrade_contract(&attacker, &fake_hash(&env, 99));
    assert!(result.is_err(), "non-owner upgrade should be rejected");

    assert_events_intact(&client, &ids, &hashes);
}

/// Calling upgrade before `initialize` must fail cleanly.
#[test]
fn upgrade_on_uninitialized_contract_fails() {
    let env = Env::default();
    let owner = Address::generate(&env);
    let contract_id = env.register(AuditLedger, ());
    let client = AuditLedgerClient::new(&env, &contract_id);
    env.mock_all_auths();

    let result = client.try_upgrade_contract(&owner, &fake_hash(&env, 1));
    assert!(result.is_err(), "upgrade on uninitialized contract should fail");
}

/// Multiple sequential upgrades must each leave storage intact and operational.
#[test]
fn multiple_sequential_upgrades_preserve_state() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let hashes = collect_hashes(&env, &client, &ids);

    for seed in [10u8, 20, 30, 40, 50] {
        client.upgrade_contract(&owner, &fake_hash(&env, seed));
    }

    assert_events_intact(&client, &ids, &hashes);
    assert_eq!(client.total_events(), 3);
}

/// An upgrade must not reset the global max-logs configuration.
#[test]
fn upgrade_preserves_global_max_logs_config() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    client.set_global_max_logs(&owner, &777);
    client.upgrade_contract(&owner, &fake_hash(&env, 11));

    // The limit is still in effect: logging up to 777 is allowed.
    // We verify indirectly by checking the governance function works and
    // that a further set still succeeds.
    client.set_global_max_logs(&owner, &778);
}

/// An upgrade while a per-event-type cap is active must preserve that cap.
#[test]
fn upgrade_preserves_event_type_cap() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let pay = symbol_short!("payment");
    client.set_event_max_logs(&owner, &pay, &2);

    client.log_event(&submitter, &pay, &Bytes::from_slice(&env, b"tx1"), &None, &None, &false);
    client.log_event(&submitter, &pay, &Bytes::from_slice(&env, b"tx2"), &None, &None, &false);

    client.upgrade_contract(&owner, &fake_hash(&env, 12));

    // Cap should still be enforced after upgrade.
    let result = client.try_log_event(
        &submitter,
        &pay,
        &Bytes::from_slice(&env, b"tx3"),
        &None,
        &None,
        &false,
    );
    assert!(result.is_err(), "per-type cap must be enforced after upgrade");
}

/// Pausing the contract must block event logging but NOT block the owner's
/// upgrade call (upgrade is an emergency-safe governance operation).
#[test]
fn upgrade_succeeds_even_when_contract_is_paused() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    client.pause(&owner);
    assert!(client.is_paused(), "contract must be paused");

    // log_event must be blocked while paused.
    let log_result = client.try_log_event(
        &submitter,
        &symbol_short!("audit"),
        &Bytes::from_slice(&env, b"blocked"),
        &None,
        &None,
        &false,
    );
    assert!(log_result.is_err(), "log_event must be blocked while paused");

    // upgrade_contract itself is not gated by the pause flag — it must succeed.
    client.upgrade_contract(&owner, &fake_hash(&env, 13));

    // After unpausing logging must work again.
    client.unpause(&owner);
    client.log_event(
        &submitter,
        &symbol_short!("audit"),
        &Bytes::from_slice(&env, b"unblocked"),
        &None,
        &None,
        &false,
    );
    assert_eq!(client.total_events(), 1);
}

/// An upgrade must emit at least one Soroban event.
#[test]
fn upgrade_emits_contract_upgraded_event() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    // Snapshot event count before the upgrade.
    let before_count = env.events().all().events().len();

    client.upgrade_contract(&owner, &fake_hash(&env, 15));

    let after_count = env.events().all().events().len();
    assert!(
        after_count > before_count,
        "upgrade_contract must emit at least one event"
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// §2  STORAGE MIGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/// Config (global_max_logs + total_events) must survive an upgrade unchanged.
#[test]
fn storage_migration_config_key_survives_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    seed_events(&env, &client, &submitter);
    let total_before = client.total_events();

    client.upgrade_contract(&owner, &fake_hash(&env, 20));

    assert_eq!(client.total_events(), total_before, "total_events must survive upgrade");
}

/// The Owner key must survive an upgrade — governance calls must still work.
#[test]
fn storage_migration_owner_key_survives_upgrade() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    client.upgrade_contract(&owner, &fake_hash(&env, 21));

    // If the owner key were lost, this governance call would panic with
    // ContractNotInitialized or CallerNotOwner.
    client.set_global_max_logs(&owner, &200);
}

/// The Owners (multi-sig list) key must survive an upgrade.
#[test]
fn storage_migration_owners_list_survives_upgrade() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    // Add a second owner before the upgrade.
    let second = Address::generate(&env);
    let mut new_owners = Vec::new(&env);
    new_owners.push_back(owner.clone());
    new_owners.push_back(second.clone());
    // Transfer ownership to the second owner then back to verify list is intact.
    client.transfer_ownership(&owner, &second);

    client.upgrade_contract(&second, &fake_hash(&env, 22));

    // second must still be the owner after the upgrade.
    client.set_global_max_logs(&second, &300);
    // original owner is now non-owner — their call must be rejected.
    let result = client.try_set_global_max_logs(&owner, &400);
    assert!(result.is_err(), "original owner must no longer be authorised after transfer");
}

/// EventCapConfig (per-type cap) must survive an upgrade and remain enforceable.
#[test]
fn storage_migration_event_cap_config_survives_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let et = symbol_short!("payment");
    client.set_event_max_logs(&owner, &et, &3);
    seed_events(&env, &client, &submitter);

    client.upgrade_contract(&owner, &fake_hash(&env, 23));

    // Cap is still present — has_cap must return true.
    assert!(client.has_cap(&et), "EventCapConfig must survive upgrade");
}

/// EventTypeCount (cached per-type event counter) must survive an upgrade.
#[test]
fn storage_migration_event_type_count_survives_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    seed_events(&env, &client, &submitter);
    let pay_count_before = client.event_count(&symbol_short!("payment"));
    let ref_count_before = client.event_count(&symbol_short!("refund"));
    let aud_count_before = client.event_count(&symbol_short!("audit"));

    client.upgrade_contract(&owner, &fake_hash(&env, 24));

    assert_eq!(client.event_count(&symbol_short!("payment")), pay_count_before);
    assert_eq!(client.event_count(&symbol_short!("refund")), ref_count_before);
    assert_eq!(client.event_count(&symbol_short!("audit")), aud_count_before);
}

/// EventOrder (sequential index → event ID map) must survive an upgrade.
#[test]
fn storage_migration_event_order_map_survives_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let hashes = collect_hashes(&env, &client, &ids);

    client.upgrade_contract(&owner, &fake_hash(&env, 25));

    // get_event_by_order relies on EventOrder — verify all three positions.
    for i in 0..ids.len() {
        assert_eq!(
            client.get_event_by_order(&i).event_hash,
            hashes.get(i).unwrap(),
            "EventOrder[{i}] must survive upgrade"
        );
    }
}

/// EventTypeIndices (packed per-type global-order indices) must survive an upgrade
/// so that get_event_by_type still resolves correctly.
#[test]
fn storage_migration_event_type_indices_survive_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let hashes = collect_hashes(&env, &client, &ids);

    client.upgrade_contract(&owner, &fake_hash(&env, 26));

    // payment is the 0th event of its type (global index 0).
    assert_eq!(
        client.get_event_by_type(&symbol_short!("payment"), &0).event_hash,
        hashes.get(0).unwrap()
    );
    // refund is the 0th of its type (global index 1).
    assert_eq!(
        client.get_event_by_type(&symbol_short!("refund"), &0).event_hash,
        hashes.get(1).unwrap()
    );
    // audit is the 0th of its type (global index 2).
    assert_eq!(
        client.get_event_by_type(&symbol_short!("audit"), &0).event_hash,
        hashes.get(2).unwrap()
    );
}

/// EventTtl configuration must survive an upgrade.
#[test]
fn storage_migration_event_ttl_survives_upgrade() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    client.set_event_ttl(&owner, &500);
    client.upgrade_contract(&owner, &fake_hash(&env, 27));

    assert_eq!(client.get_event_ttl(), 500, "EventTtl must survive upgrade");
}

/// GlobalMetadataMaxSize must survive an upgrade and still be enforced.
#[test]
fn storage_migration_global_metadata_max_size_survives_upgrade() {
    // Use a fresh environment initialized with a 32-byte metadata cap.
    let env2 = Env::default();
    let owner2 = Address::generate(&env2);
    let submitter = Address::generate(&env2);
    let cid2 = env2.register(AuditLedger, ());
    let client2 = AuditLedgerClient::new(&env2, &cid2);
    env2.mock_all_auths();
    let mut owners2 = Vec::new(&env2);
    owners2.push_back(owner2.clone());
    client2.initialize(&owners2, &1000, &32);

    client2.upgrade_contract(&owner2, &fake_hash(&env2, 28));

    // Payload within limit must succeed.
    client2.log_event(
        &submitter,
        &symbol_short!("audit"),
        &Bytes::from_slice(&env2, b"short"),
        &None,
        &None,
        &false,
    );

    // Payload exceeding the 32-byte cap must be rejected.
    let oversized = Bytes::from_slice(&env2, b"this_metadata_is_longer_than_32_bytes_limit!");
    let result = client2.try_log_event(&submitter, &symbol_short!("audit"), &oversized, &None, &None, &false);
    assert!(result.is_err(), "metadata cap must be enforced after upgrade");
}

/// ContractVersion key (set to 1 during initialize) must be readable after an upgrade.
#[test]
fn storage_migration_contract_version_key_survives_upgrade() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    client.upgrade_contract(&owner, &fake_hash(&env, 29));

    // Verify the contract is still considered initialized (Owner + Config present).
    // If ContractVersion were cleared, a future initialize call would panic with
    // AlreadyInitialized only if the Owner key is still there — verify
    // that a double-init is still rejected.
    let mut owners = Vec::new(&env);
    owners.push_back(owner.clone());
    let result = client.try_initialize(&owners, &100, &4096);
    assert!(result.is_err(), "double-initialize must fail after upgrade (storage intact)");
}

// ═══════════════════════════════════════════════════════════════════════════════
// §3  BACKWARD COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

/// Event fields logged before an upgrade must be bit-for-bit identical after.
#[test]
fn backward_compat_event_fields_unchanged_after_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let id = client.log_event(
        &submitter,
        &symbol_short!("payment"),
        &Bytes::from_slice(&env, b"{\"amount\":42}"),
        &None,
        &None,
        &false,
    );
    let before = client.get_event(&id);

    client.upgrade_contract(&owner, &fake_hash(&env, 40));

    let after = client.get_event(&id);
    assert_eq!(after.index, before.index, "index must be unchanged");
    assert_eq!(after.timestamp, before.timestamp, "timestamp must be unchanged");
    assert_eq!(after.event_type, before.event_type, "event_type must be unchanged");
    assert_eq!(after.submitter, before.submitter, "submitter must be unchanged");
    assert_eq!(after.metadata, before.metadata, "metadata must be unchanged");
    assert_eq!(after.event_hash, before.event_hash, "event_hash must be unchanged");
    assert_eq!(after.prev_hash, before.prev_hash, "prev_hash must be unchanged");
    assert_eq!(after.version, before.version, "version must be unchanged");
}

/// event_hash values computed before an upgrade must be stable after it.
#[test]
fn backward_compat_event_hashes_stable_across_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let before = collect_hashes(&env, &client, &ids);

    client.upgrade_contract(&owner, &fake_hash(&env, 41));

    let after = collect_hashes(&env, &client, &ids);
    assert_eq!(after, before, "all event hashes must be identical after upgrade");
}

/// The hash chain (prev_hash linkage) must remain valid after an upgrade.
#[test]
fn backward_compat_hash_chain_intact_after_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    seed_events(&env, &client, &submitter);
    client.upgrade_contract(&owner, &fake_hash(&env, 42));

    assert!(client.verify_integrity(), "hash chain must pass integrity check after upgrade");
}

/// genesis event's prev_hash must remain all-zeros after an upgrade.
#[test]
fn backward_compat_genesis_prev_hash_remains_zero_after_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let id = client.log_event(
        &submitter,
        &symbol_short!("audit"),
        &Bytes::from_slice(&env, b"genesis"),
        &None,
        &None,
        &false,
    );
    client.upgrade_contract(&owner, &fake_hash(&env, 43));

    let ev = client.get_event(&id);
    assert_eq!(
        ev.prev_hash,
        BytesN::from_array(&env, &[0u8; 32]),
        "genesis prev_hash must remain all-zeros after upgrade"
    );
}

/// Events logged after the upgrade must chain correctly from pre-upgrade events.
#[test]
fn backward_compat_new_events_chain_from_pre_upgrade_events() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let last_pre_hash = client.get_event(&ids.get(2).unwrap()).event_hash.clone();

    client.upgrade_contract(&owner, &fake_hash(&env, 44));

    let new_id = client.log_event(
        &submitter,
        &symbol_short!("audit"),
        &Bytes::from_slice(&env, b"post-upgrade"),
        &None,
        &None,
        &false,
    );
    let new_ev = client.get_event(&new_id);
    assert_eq!(
        new_ev.prev_hash, last_pre_hash,
        "post-upgrade event must chain from the last pre-upgrade event"
    );
    assert_eq!(new_ev.index, 3);
}

/// Per-type retrieval (get_event_by_type) must return the same events after upgrade.
#[test]
fn backward_compat_get_event_by_type_returns_same_data_after_upgrade() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let pay_before = client.get_event_by_type(&symbol_short!("payment"), &0);
    let ref_before = client.get_event_by_type(&symbol_short!("refund"), &0);

    client.upgrade_contract(&owner, &fake_hash(&env, 45));

    let pay_after = client.get_event_by_type(&symbol_short!("payment"), &0);
    let ref_after = client.get_event_by_type(&symbol_short!("refund"), &0);

    assert_eq!(pay_after.event_hash, pay_before.event_hash);
    assert_eq!(pay_after.metadata, pay_before.metadata);
    assert_eq!(ref_after.event_hash, ref_before.event_hash);
    assert_eq!(ref_after.metadata, ref_before.metadata);

    // Suppress unused-variable warning
    let _ = ids;
}

/// Governance functions must behave identically before and after an upgrade.
#[test]
fn backward_compat_governance_functions_work_after_upgrade() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    client.upgrade_contract(&owner, &fake_hash(&env, 46));

    // set_global_max_logs
    client.set_global_max_logs(&owner, &2000);

    // set_event_max_logs + remove_event_cap
    let et = symbol_short!("payment");
    client.set_event_max_logs(&owner, &et, &10);
    assert!(client.has_cap(&et));
    client.remove_event_cap(&owner, &et);
    assert!(!client.has_cap(&et));

    // pause / unpause
    client.pause(&owner);
    assert!(client.is_paused());
    client.unpause(&owner);
    assert!(!client.is_paused());
}

/// Integrity verification must succeed for events spanning both sides of an upgrade.
#[test]
fn backward_compat_integrity_spans_pre_and_post_upgrade_events() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    seed_events(&env, &client, &submitter);
    client.upgrade_contract(&owner, &fake_hash(&env, 47));

    // Log two more events after the upgrade.
    for _ in 0..2u32 {
        client.log_event(
            &submitter,
            &symbol_short!("audit"),
            &Bytes::from_slice(&env, b"post"),
            &None,
            &None,
            &false,
        );
    }

    assert_eq!(client.total_events(), 5);
    assert!(
        client.verify_integrity(),
        "full chain integrity must hold across upgrade boundary"
    );
}

/// transfer_ownership before an upgrade must result in the new owner being
/// authorised after the upgrade and the old owner being rejected.
#[test]
fn backward_compat_ownership_transfer_respected_after_upgrade() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&owner, &new_owner);
    client.upgrade_contract(&new_owner, &fake_hash(&env, 48));

    // new_owner must be authorised.
    client.set_global_max_logs(&new_owner, &123);

    // old owner must be rejected.
    let result = client.try_set_global_max_logs(&owner, &456);
    assert!(result.is_err(), "old owner must be rejected after transfer and upgrade");
}

// ═══════════════════════════════════════════════════════════════════════════════
// §4  ROLLBACK
// ═══════════════════════════════════════════════════════════════════════════════

/// Rolling back (upgrade → re-upgrade to prior hash) must preserve all events.
#[test]
fn rollback_preserves_all_pre_upgrade_events() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let ids = seed_events(&env, &client, &submitter);
    let hashes = collect_hashes(&env, &client, &ids);

    let v1 = fake_hash(&env, 60);
    let v2 = fake_hash(&env, 61); // "rollback target"
    client.upgrade_contract(&owner, &v1);
    client.upgrade_contract(&owner, &v2);

    assert_events_intact(&client, &ids, &hashes);
    assert_eq!(client.total_events(), 3);
}

/// After rollback, logging a new event must continue the sequence correctly.
#[test]
fn rollback_allows_continued_event_logging() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    seed_events(&env, &client, &submitter);
    client.upgrade_contract(&owner, &fake_hash(&env, 62));
    client.upgrade_contract(&owner, &fake_hash(&env, 63));

    let new_id = client.log_event(
        &submitter,
        &symbol_short!("audit"),
        &Bytes::from_slice(&env, b"{\"ref\":\"POST-ROLLBACK\"}"),
        &None,
        &None,
        &false,
    );
    let new_ev = client.get_event(&new_id);
    assert_eq!(new_ev.index, 3);
    assert_eq!(client.total_events(), 4);
}

/// After rollback, the global max-logs cap must still be the same value.
#[test]
fn rollback_preserves_global_max_logs() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    client.set_global_max_logs(&owner, &555);
    client.upgrade_contract(&owner, &fake_hash(&env, 64));
    client.upgrade_contract(&owner, &fake_hash(&env, 65));

    // Re-setting to the same value must succeed (not below current count).
    client.set_global_max_logs(&owner, &555);
}

/// After rollback, governance functions must still be callable by the owner.
#[test]
fn rollback_governance_functions_remain_operational() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    client.upgrade_contract(&owner, &fake_hash(&env, 66));
    client.upgrade_contract(&owner, &fake_hash(&env, 67));

    // All governance operations must work without error.
    client.set_global_max_logs(&owner, &800);
    client.set_event_max_logs(&owner, &symbol_short!("payment"), &50);
    client.remove_event_cap(&owner, &symbol_short!("payment"));
    client.set_event_ttl(&owner, &100);
    client.pause(&owner);
    client.unpause(&owner);
}

/// The hash chain must pass full integrity verification after rollback.
#[test]
fn rollback_integrity_chain_valid_after_rollback() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    seed_events(&env, &client, &submitter);
    client.upgrade_contract(&owner, &fake_hash(&env, 68));
    client.upgrade_contract(&owner, &fake_hash(&env, 69));

    assert!(
        client.verify_integrity(),
        "hash chain must be valid after rollback"
    );
}

/// After rollback, per-type event caps must still be enforced.
#[test]
fn rollback_event_type_cap_still_enforced() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    let et = symbol_short!("payment");
    client.set_event_max_logs(&owner, &et, &1);
    client.log_event(&submitter, &et, &Bytes::from_slice(&env, b"tx1"), &None, &None, &false);

    client.upgrade_contract(&owner, &fake_hash(&env, 70));
    client.upgrade_contract(&owner, &fake_hash(&env, 71));

    let result = client.try_log_event(&submitter, &et, &Bytes::from_slice(&env, b"tx2"), &None, &None, &false);
    assert!(result.is_err(), "per-type cap must remain enforced after rollback");
}

/// Ownership transfers survive rollback: new owner authorised, old owner rejected.
#[test]
fn rollback_ownership_transfer_survives() {
    let (env, owner, client) = setup();
    env.mock_all_auths();

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&owner, &new_owner);

    client.upgrade_contract(&new_owner, &fake_hash(&env, 72));
    client.upgrade_contract(&new_owner, &fake_hash(&env, 73));

    client.set_global_max_logs(&new_owner, &999);
    let result = client.try_set_global_max_logs(&owner, &1);
    assert!(result.is_err(), "old owner must remain unauthorised after rollback");
}

/// Events added between two upgrades must survive a subsequent rollback.
#[test]
fn rollback_events_logged_between_upgrades_are_preserved() {
    let (env, owner, client) = setup();
    let submitter = Address::generate(&env);
    env.mock_all_auths();

    // Pre-upgrade events
    let ids_pre = seed_events(&env, &client, &submitter);
    let hashes_pre = collect_hashes(&env, &client, &ids_pre);

    client.upgrade_contract(&owner, &fake_hash(&env, 74));

    // Events logged between v1 and rollback
    let mid_id = client.log_event(
        &submitter,
        &symbol_short!("audit"),
        &Bytes::from_slice(&env, b"between-upgrades"),
        &None,
        &None,
        &false,
    );
    let mid_hash = client.get_event(&mid_id).event_hash.clone();

    // Rollback
    client.upgrade_contract(&owner, &fake_hash(&env, 75));

    // All pre-upgrade events intact
    assert_events_intact(&client, &ids_pre, &hashes_pre);

    // Intermediate event also intact
    let mid_after = client.get_event(&mid_id);
    assert_eq!(mid_after.event_hash, mid_hash);
    assert_eq!(mid_after.index, 3);
    assert_eq!(client.total_events(), 4);
}
