# Optimization Guide

## Contract Optimizations

### Metadata Size

Metadata is the primary cost driver for event logging. Keep metadata as small as possible:

```rust
// Prefer compact binary formats
let metadata: Bytes = Bytes::from_slice(&env, &[0x00, 0x01, 0x02]); // 3 bytes

// Avoid large JSON strings in metadata
// Instead: use a schema with compact encoding
```

### Batch Logging

Use `log_events` for multiple events from the same submitter to reduce overhead:

```rust
// Instead of individual calls:
contract.log_event(&submitter, &"payment", &metadata1);
contract.log_event(&submitter, &"payment", &metadata2);

// Use batch call:
contract.log_events(&events);
```

### TTL Storage

TTL storage adds cost. Only enable `set_event_ttl` when events must persist beyond default Soroban TTL:

```rust
// Set TTL only if needed
if require_long_term_storage {
    contract.set_event_ttl(&owner, &ttl_ledgers);
}
```

## Off-Chain Optimizations

### Caching

- Cache `total_events()` result to reduce RPC calls
- Cache governance settings (caps, owner) until a governance event is observed
- Use the WebSocket event stream to invalidate caches

### Query Patterns

```typescript
// Inefficient: one RPC call per event
for (let i = 0; i < total; i++) {
    const event = await getEvent(id);
}

// Efficient: use batch queries via the GraphQL API
const query = `
  query GetEvents($first: Int!) {
    events(first: $first) {
      index
      timestamp
      eventType
      metadata
    }
  }
`;
```

### WebSocket Connections

- Maintain persistent WebSocket connections instead of polling
- Use event type filtering to receive only relevant events
- Reconnect with exponential backoff on disconnect

## Relayer Optimizations

- Increase poll interval when event rate is low
- Batch proof submissions where possible
- Use gas-efficient proof formats
- Monitor EVM gas prices and time submissions accordingly

## SDK Optimizations

### JavaScript SDK

```typescript
// Reuse contract client instance
const client = new AuditLedgerClient(rpcUrl);

// Batch reads where possible
const [total, event] = await Promise.all([
    client.totalEvents(),
    client.getEvent(id),
]);
```

### Python SDK

```python
# Use connection pooling
import httpx

async with httpx.AsyncClient() as client:
    sdk = AuditLedgerSDK(client, contract_id)
```

## Profiling

To identify performance bottlenecks:

```bash
# Profile contract operations
cargo test -- --nocapture --test-threads=1

# Monitor off-chain service metrics
curl http://localhost:8000/metrics

# Trace Soroban RPC calls
RUST_LOG=soroban_client=debug cargo run
```
