# Troubleshooting Guide

Self-service reference for diagnosing issues you are likely to encounter during onboarding and development. Organized by the phase where the problem typically appears.

For a full list of contract error codes, see [docs/error-reference.md](../error-reference.md).

---

## Build Failures

### `error[E0463]: can't find crate for ...` / missing WASM target

**Symptom:** `cargo build --target wasm32-unknown-unknown` fails because the target is missing.

**Fix:**

```bash
rustup target add wasm32-unknown-unknown
```

Then retry the build.

---

### `cargo build` fails with toolchain version errors

**Symptom:** The build fails citing a minimum Rust version requirement or unstable feature.

**Fix:**

```bash
# Update to the latest stable toolchain
rustup update stable

# Verify the active toolchain
rustc --version
```

If the repo has a `rust-toolchain.toml` or `rust-toolchain` file, `rustup` will automatically use the pinned version when you run any `cargo` command from the project directory.

---

### WASM binary too large

**Symptom:** `soroban contract deploy` warns about binary size or rejects the file.

**Cause:** A debug build includes symbols and unoptimized code.

**Fix:** Always use the `--release` profile for deployment. The `Cargo.toml` already sets `opt-level = "z"`, `lto = true`, `debug = 0`, and `strip = "symbols"`:

```bash
cargo build --target wasm32-unknown-unknown --release
ls -lh target/wasm32-unknown-unknown/release/audit_ledger.wasm
```

If the binary is still too large, run the Soroban optimizer:

```bash
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/audit_ledger.wasm
# writes audit_ledger.optimized.wasm
```

---

## Test Failures

### Tests fail with `already initialized` panics

**Symptom:** Multiple tests fail because they all try to initialize the same contract instance.

**Cause:** Each test must create its own `Env` and contract client. Shared state bleeds between tests.

**Fix:** Ensure each test creates a fresh environment:

```rust
#[test]
fn test_my_feature() {
    let env = Env::default();
    let contract_id = env.register_contract(None, AuditLedger);
    let client = AuditLedgerClient::new(&env, &contract_id);
    // ... initialize and test in isolation
}
```

---

### `cargo test` is slow

**Symptom:** The full test suite takes much longer than expected.

**Fix:** Run only the relevant test file or a named test during development:

```bash
# Run a single test
cargo test test_log_event

# Run all tests in one module
cargo test boundary

# Run with parallelism limit (useful on low-core machines)
cargo test -- --test-threads=4
```

---

### Property tests (`proptest`) report a shrunk counterexample

**Symptom:** A proptest failure prints a "shrunk input" that triggers the bug.

**Fix:** Copy the printed shrunk input, write it as a focused regression test in `src/regression_tests.rs`, fix the underlying bug, and confirm the new test passes.

---

## Deployment Issues

### "Insufficient account balance"

**Symptom:** Transaction fails with `op_underfunded` or similar.

**Cause:** The source account does not have enough XLM for the base reserve plus transaction fees. Stellar accounts require a minimum 1 XLM reserve (2 × 0.5 XLM). Each additional data entry adds 0.5 XLM.

**Fix — testnet:** Fund via Friendbot:

```bash
curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
```

**Fix — mainnet:** Transfer XLM from an exchange or another funded wallet.

---

### "Network timeout / transaction expired"

**Symptom:** CLI hangs or returns a timeout; no transaction appears on-chain.

**Cause:** Network congestion or a fee too low for surge pricing.

**Fix:**

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/audit_ledger.wasm \
  --source "$SOROBAN_SECRET_KEY" \
  --network testnet \
  --fee 100000
```

Check network status at [https://status.stellar.org](https://status.stellar.org).

---

### Deploy script exits with "Must set SOROBAN_SECRET_KEY"

**Symptom:** `./scripts/deploy_testnet.sh` immediately exits.

**Fix:**

```bash
export SOROBAN_SECRET_KEY="<your_secret_key>"
./scripts/deploy_testnet.sh
```

Never commit secret keys to the repository.

---

## Initialization Issues

### "Contract not found"

**Symptom:** Any invocation returns `contract not found`.

**Cause:** Wrong `CONTRACT_ID`, wrong network, or the deployment did not complete.

**Fix:**

```bash
# Check what CONTRACT_ID is set in your .env
grep CONTRACT_ID .env

# Verify it exists on the correct network
soroban contract fetch --id "$CONTRACT_ID" --network testnet
```

If the deployment failed mid-way, redeploy and reinitialize from scratch.

---

### `AlreadyInitialized` error on `initialize`

**Symptom:** Calling `initialize` a second time panics.

**Cause:** The contract can only be initialized once. This is by design.

**Fix:** Do not call `initialize` again. If you need a fresh contract for testing, deploy a new instance.

---

### `CallerNotOwner` (error code 1) on `initialize` or governance functions

**Symptom:** `initialize` or a governance call returns error `1`.

**Cause:** The `--source` signing key does not match the `--owner` (or `--caller`) address passed to the function.

**Fix:**

```bash
# Print the public key for a named key
soroban keys address <key-name>
```

The printed address must match the value you pass as `--owner` / `--caller`. Both the signing key and the caller argument must refer to the same account.

---

## Runtime Contract Errors

### `GlobalMaxLogsReached` (error code 2)

**Symptom:** `log_event` or `log_events` fails with error `2`.

**Cause:** `total_events` has reached `global_max_logs`.

**Fix (owner only):**

```bash
soroban contract invoke \
  --id "$CONTRACT_ID" --source "$OWNER_KEY" --network testnet \
  -- set_global_max_logs \
  --caller "$OWNER_ADDRESS" \
  --new_max 200000
```

Check the current count before raising the cap:

```bash
soroban contract invoke --id "$CONTRACT_ID" --network testnet -- total_events
```

---

### `EventTypeMaxLogsReached` (error code 3)

**Symptom:** `log_event` fails with error `3` for a specific type.

**Cause:** The per-type log count has hit the cap for that event type.

**Fix — raise the cap:**

```bash
soroban contract invoke \
  --id "$CONTRACT_ID" --source "$OWNER_KEY" --network testnet \
  -- set_event_max_logs \
  --caller "$OWNER_ADDRESS" \
  --event_type payment \
  --new_max 5000
```

**Fix — remove the cap entirely** (falls back to global-only enforcement):

```bash
soroban contract invoke \
  --id "$CONTRACT_ID" --source "$OWNER_KEY" --network testnet \
  -- remove_event_cap \
  --caller "$OWNER_ADDRESS" \
  --event_type payment
```

Note: calling `remove_event_cap` a second time returns error `17` (`CapAlreadyRemoved`).

---

### `ContractPaused` (error code 13)

**Symptom:** All write operations are rejected with error `13`.

**Cause:** The owner called `pause()` to freeze the contract.

**Fix (owner only):**

```bash
soroban contract invoke \
  --id "$CONTRACT_ID" --source "$OWNER_KEY" --network testnet \
  -- unpause --caller "$OWNER_ADDRESS"
```

---

### `MetadataTooLarge` (error code 8)

**Symptom:** `log_event` fails with error `8`.

**Cause:** The `metadata` bytes exceed the allowed size limit.

**Fix:** Trim or compress the metadata before submitting. For large payloads, store the content off-chain (IPFS, S3) and log only the content hash.

If the limit must be raised (owner only):

```bash
soroban contract invoke \
  --id "$CONTRACT_ID" --source "$OWNER_KEY" --network testnet \
  -- set_event_metadata_max_size \
  --caller "$OWNER_ADDRESS" \
  --event_type payment \
  --new_max 4096
```

---

### `RateLimitExceeded` (error code 14)

**Symptom:** A submitter's transaction is rejected with error `14`.

**Cause:** The submitter has hit their per-ledger rate limit.

**Fix:** Wait for the next ledger (~5 seconds on testnet) and retry. Alternatively, have the owner raise the limit:

```bash
soroban contract invoke \
  --id "$CONTRACT_ID" --source "$OWNER_KEY" --network testnet \
  -- set_submitter_rate_limit \
  --caller "$OWNER_ADDRESS" \
  --submitter "$SUBMITTER_ADDRESS" \
  --limit 10
```

---

### `EventDoesNotExist` (error code 4)

**Symptom:** `get_event` returns error `4`.

**Cause:** The event ID (`BytesN<32>`) is a SHA-256 hash, not a sequential integer. Passing a sequential index will always fail.

**Fix:** Use the ID returned by `log_event` directly. To iterate over all events, use `get_event_by_type` with a sequential `type_index` from `0` to `event_count(event_type) - 1`.

---

## Docker / Local Stack Issues

### Services fail to start — "Cannot connect to the Docker daemon"

**Fix:**

```bash
# Linux / WSL
sudo systemctl start docker

# macOS
open /Applications/Docker.app
```

---

### `docker compose up` fails with missing `.env` variables

**Symptom:** Services start but crash immediately, or Compose prints "variable is not set".

**Fix:**

```bash
cp .env.example .env
# Open .env and set at minimum CONTRACT_ID
```

---

### Grafana shows "No data" in dashboards

**Cause:** Prometheus has not scraped any data yet, or the metrics exporter cannot reach the contract.

**Checklist:**
1. Confirm `CONTRACT_ID` is set correctly in `.env`.
2. Check the metrics exporter logs:
   ```bash
   docker compose logs metrics-exporter
   ```
3. Verify the exporter is up:
   ```bash
   curl http://localhost:8000/metrics
   ```
4. Check Prometheus targets at [http://localhost:9090/targets](http://localhost:9090/targets) — the `audit-ledger` job should be green.

---

### Bridge relayer health check fails

**Symptom:** `docker compose ps` shows the relayer as unhealthy.

**Checklist:**
1. Confirm `CONTRACT_ID`, `EVM_RPC`, and `VERIFIER_ADDRESS` are set in `.env`.
2. Check relayer logs:
   ```bash
   docker compose logs relayer
   ```
3. Test the health endpoint manually:
   ```bash
   curl http://localhost:8080/healthz
   ```

---

## Integration / SDK Issues

### "Cannot parse event data" / metadata decoding fails

**Cause:** The `metadata` field is opaque `Bytes`. The contract does not enforce a schema.

**Fix:** Agree on an encoding before logging. Recommended approaches:
- XDR-encoded struct (most compact, Stellar-native)
- JSON string (easiest to debug)

To inspect raw bytes:

```bash
soroban contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_event --id <EVENT_ID>
```

Then decode the `metadata` field with your chosen encoder. If using the JS SDK, call the appropriate `.toString()` or decode helper on the returned `Bytes`.

---

### `log_events` batch transaction rejected as "too large"

**Cause:** Stellar has a transaction size limit. Large batches or large metadata payloads can exceed it.

**Fix:** Split the batch into chunks of 10–20 events:

```typescript
const CHUNK_SIZE = 10;
for (let i = 0; i < events.length; i += CHUNK_SIZE) {
  await client.logEvents(events.slice(i, i + CHUNK_SIZE));
}
```

---

## CI Failures

### `cargo fmt --check` fails

**Fix:** Run `cargo fmt` locally, then commit the reformatted files:

```bash
cargo fmt
git add -u
git commit -m "chore: apply cargo fmt"
```

---

### `cargo audit` fails with a known vulnerability

**Symptom:** CI fails on the `cargo audit --deny warnings` step.

**Fix:**

```bash
# See which dependency has the advisory
cargo audit

# Update the dependency
cargo update <crate-name>

# If no fix is available, check the advisory for workarounds
# and open an issue on the repo to track the advisory
```

---

## FAQ

**Q: Can I delete or edit a logged event?**
A: No. The ledger is append-only by design. Events are content-addressed by SHA-256 and form a hash chain. Modifying history requires breaking SHA-256.

**Q: What happens if I call `initialize` twice?**
A: The second call panics with `AlreadyInitialized`. Deploy a new contract instance for a fresh start.

**Q: How do I read all events for a given type?**
A: Use `event_count` to get the total, then iterate with `get_event_by_type`:

```bash
COUNT=$(soroban contract invoke --id "$CONTRACT_ID" --network testnet \
  -- event_count --event_type payment)

for i in $(seq 0 $((COUNT - 1))); do
  soroban contract invoke --id "$CONTRACT_ID" --network testnet \
    -- get_event_by_type --event_type payment --type_index "$i"
done
```

**Q: How do I transfer ownership if the owner key is lost?**
A: There is no on-chain recovery path. Ownership is enforced by `require_auth()`. Back up the owner's secret key securely. Consider setting up a multisig account as the owner from the start.

**Q: How do I check whether an event cap is active for a type?**
A: Call `get_event_cap` for the event type. If it returns nothing or indicates the cap was removed, only the global cap applies.

**Q: Where do I report a security vulnerability?**
A: Do not open a public GitHub issue. Follow the responsible disclosure process in [docs/security-audit.md](../security-audit.md).

---

## Still Stuck?

1. Check [docs/error-reference.md](../error-reference.md) for a full table of all 18 contract error codes.
2. Check [docs/api.md](../api.md) for the complete function reference.
3. Open a GitHub issue with the error message, relevant logs, the commands you ran, and your environment details (OS, Rust version, Soroban CLI version).
