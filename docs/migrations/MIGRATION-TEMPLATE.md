# Migration Guide — v<!--PREV_VERSION--> → v<!--NEXT_VERSION-->

**Date:** <!--YYYY-MM-DD-->  
**Contract address (testnet):** `<!--CONTRACT_ID-->`  
**Estimated migration time:** <!--e.g. 15 minutes-->  
**Downtime required:** <!--Yes / No — explain-->

> **Before you start:** read the full [upgrade guide](../upgrade-guide.md) to
> understand the general WASM upgrade process, backup procedure, and rollback
> steps. This document covers only the *version-specific* differences.

---

## Summary of Breaking Changes

<!--
  One-line description per breaking change. Detailed steps follow below.
-->

| # | Component | Change |
|---|-----------|--------|
| 1 | <!--Contract / JS SDK / Python SDK / REST API / GraphQL API / Infra--> | <!--Short description--> |
| 2 | | |

---

## Pre-Migration Checklist

- [ ] Read the full [upgrade guide](../upgrade-guide.md).
- [ ] Back up all event data off-chain:
  ```bash
  bash tools/backup/backup.sh
  bash tools/backup/verify.sh
  ```
- [ ] Record pre-migration state:
  ```bash
  soroban contract invoke --id $CONTRACT_ID --network testnet -- total_events
  soroban contract invoke --id $CONTRACT_ID --network testnet -- get_owner
  ```
- [ ] Notify all integrators at least **48 hours** before the maintenance window.
- [ ] Freeze event logging:
  ```bash
  TOTAL=$(soroban contract invoke --id $CONTRACT_ID --network testnet -- total_events)
  soroban contract invoke \
    --id $CONTRACT_ID --source $OWNER_KEY --network testnet \
    -- set_global_max_logs --caller $OWNER_ADDRESS --new_max "$TOTAL"
  ```
- [ ] Deploy the new WASM to a **staging / forked network** and run the smoke tests
  before touching testnet or mainnet.

---

## Contract Migration

### 1. Build and install the new WASM

```bash
cargo build --target wasm32v1-none --release
soroban contract optimize \
  --wasm target/wasm32v1-none/release/audit_ledger.wasm

NEW_HASH=$(soroban contract install \
  --wasm target/wasm32v1-none/release/audit_ledger.optimized.wasm \
  --source $OWNER_KEY \
  --network testnet)

echo "New WASM hash: $NEW_HASH"
# Record this value — you need it for rollback
```

### 2. Invoke the WASM upgrade

```bash
soroban contract invoke \
  --id $CONTRACT_ID --source $OWNER_KEY --network testnet \
  -- upgrade \
  --caller $OWNER_ADDRESS \
  --new_wasm_hash "$NEW_HASH"
```

### 3. Run the data migration function (if required)

<!--
  Delete this section if no data migration is needed.
  Describe exactly which storage keys changed and why.
-->

This release changes <!--describe storage key change-->. Run the one-time
migration function before allowing new writes:

```bash
soroban contract invoke \
  --id $CONTRACT_ID --source $OWNER_KEY --network testnet \
  -- migrate_v<!--PREV_SEMVER_UNDERSCORED-->_to_v<!--NEXT_SEMVER_UNDERSCORED--> \
  --caller $OWNER_ADDRESS
```

**What this function does:**
- <!--step 1-->
- <!--step 2-->

Old storage keys are left as tombstones and are never reused.

### 4. Verify the migration

```bash
# Total events must match the pre-migration snapshot
soroban contract invoke --id $CONTRACT_ID --network testnet -- total_events

# Spot-check a known event
soroban contract invoke --id $CONTRACT_ID --network testnet \
  -- get_event --id <KNOWN_EVENT_ID>

# Verify ownership
soroban contract invoke --id $CONTRACT_ID --network testnet -- get_owner
```

### 5. Unfreeze logging

```bash
soroban contract invoke \
  --id $CONTRACT_ID --source $OWNER_KEY --network testnet \
  -- set_global_max_logs --caller $OWNER_ADDRESS --new_max 500000
```

---

## JavaScript / TypeScript SDK Migration

<!--
  Delete this section if the JS SDK has no breaking changes.
-->

### Package version

```bash
npm install @audit-ledger/sdk@<!--NEXT_VERSION-->
```

### API changes

#### <!--Changed function / type name-->

**Before (v<!--PREV_VERSION-->):**

```typescript
// old usage example
```

**After (v<!--NEXT_VERSION-->):**

```typescript
// new usage example
```

**Why:** <!--reason for the change-->

---

## Python SDK Migration

<!--
  Delete this section if the Python SDK has no breaking changes.
-->

### Package version

```bash
pip install audit-ledger==<!--NEXT_VERSION-->
```

### API changes

#### <!--Changed function / type name-->

**Before (v<!--PREV_VERSION-->):**

```python
# old usage example
```

**After (v<!--NEXT_VERSION-->):**

```python
# new usage example
```

---

## REST API Migration

<!--
  Delete this section if the REST API has no breaking changes.
-->

### Endpoint changes

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/events/:id` | <!--e.g. response field `type` renamed to `event_type`--> |

### Updated request/response examples

<!--
  Show before/after cURL examples for each changed endpoint.
-->

---

## GraphQL API Migration

<!--
  Delete this section if the GraphQL API has no breaking changes.
-->

### Schema changes

```graphql
# Removed / renamed / added fields
```

---

## Infrastructure Migration

<!--
  Delete this section if there are no infrastructure changes.
  Include Docker image version bumps, new env vars, config file changes, etc.
-->

### Environment variables

| Variable | Change | Action required |
|----------|--------|----------------|
| `<!--VAR_NAME-->` | <!--Added / Removed / Renamed from X--> | <!--Update .env--> |

### Docker Compose

```bash
docker compose pull
docker compose up --build -d
```

---

## Rollback Procedure

If the migration fails, follow these steps to revert:

1. **Freeze logging** (if not already frozen).
2. **Upgrade back** to the previous WASM:
   ```bash
   PREV_HASH="<!--PREVIOUS_WASM_HASH-->"
   soroban contract invoke \
     --id $CONTRACT_ID --source $OWNER_KEY --network testnet \
     -- upgrade --caller $OWNER_ADDRESS --new_wasm_hash "$PREV_HASH"
   ```
3. **Undo data migration** (if it ran):
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID --source $OWNER_KEY --network testnet \
     -- rollback_v<!--NEXT_SEMVER_UNDERSCORED-->_to_v<!--PREV_SEMVER_UNDERSCORED--> \
     --caller $OWNER_ADDRESS
   ```
   > If a rollback function was not written ahead of time, restore from the
   > off-chain backup using `tools/backup/restore.sh`.
4. **Verify state** — confirm `total_events` matches the pre-migration snapshot.
5. **Unfreeze logging.**
6. **Notify integrators** of the rollback.

---

## Post-Migration Smoke Tests

Run these after every successful migration:

```bash
# 1. Log a test event
soroban contract invoke \
  --id $CONTRACT_ID --source $SUBMITTER_KEY --network testnet \
  -- log_event \
  --submitter $SUBMITTER_ADDRESS \
  --event_type smoke_test \
  --metadata "migration-verified-v<!--NEXT_VERSION-->"

# 2. Confirm it was recorded
soroban contract invoke --id $CONTRACT_ID --network testnet -- total_events
```

---

## Support

Open an issue at
[github.com/daddygokings-art/Decentralized-Audit-Transparency-Ledger/issues](https://github.com/daddygokings-art/Decentralized-Audit-Transparency-Ledger/issues)
or start a discussion if you run into problems during migration.
