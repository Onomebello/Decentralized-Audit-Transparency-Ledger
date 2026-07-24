# Performance Characteristics

## Contract Layer

### Event Logging

| Operation | Complexity | Gas Estimate | Notes |
|-----------|------------|--------------|-------|
| `log_event` | O(1) write | ~5,000–20,000 | Depends on metadata size and storage state |
| `log_events` (batch) | O(n) writes | ~4,000–15,000 per event | Sequential per-event processing |
| `get_event` | O(1) read | ~1,000–5,000 | Content-addressed lookup |
| `total_events` | O(1) read | ~500 | Stored counter |
| `event_count` | O(1) read | ~500 | Per-type stored counter |

### Governance

| Operation | Complexity | Gas Estimate | Notes |
|-----------|------------|--------------|-------|
| `set_global_max_logs` | O(1) write | ~3,000 | Emits governance event |
| `set_event_max_logs` | O(1) write | ~3,000 | Emits governance event |
| `transfer_ownership` | O(1) write | ~3,000 | Emits governance event |
| `set_event_ttl` | O(1) write | ~3,000 | Emits governance event |

### Storage Growth

| Component | Growth Rate | Bound |
|-----------|-------------|-------|
| Global event log | N events × ~200 bytes | `global_max_logs` |
| Per-type event logs | N events per type × ~200 bytes | Per-event cap or unbounded |
| Event hashes | N events × 32 bytes | Same as event count |

## Off-Chain Layer

### REST API

| Endpoint | Latency (p50) | Latency (p99) | Throughput |
|----------|---------------|---------------|------------|
| Event query | 50–150ms | 500ms | ~100 req/s |
| Stats query | 30–100ms | 300ms | ~200 req/s |

### GraphQL API

| Query | Latency (p50) | Latency (p99) | Throughput |
|-------|---------------|---------------|------------|
| Simple query | 100–300ms | 1s | ~50 req/s |
| Subscription | <50ms (push) | 200ms | ~1,000 events/s |

### WebSocket Stream

| Metric | Value |
|--------|-------|
| Connection latency | ~50ms |
| Max concurrent connections | ~500 |
| Event push latency | <100ms |

## Bridge Layer

| Operation | Latency | Gas (EVM) |
|-----------|---------|-----------|
| Proof construction | 1–5s | N/A (off-chain) |
| Proof submission (EVM) | 15–60s (block time) | ~100,000–300,000 gas |
| Verification (EVM) | ~15s | ~50,000–150,000 gas |

## Key Bottlenecks

1. **On-chain storage writes**: The dominant cost for event logging. Batch operations do not reduce per-event cost.
2. **Metadata size**: Larger metadata increases both cost and storage footprint linearly.
3. **Event count queries**: `total_events()` is O(1); pagination over events requires multiple RPC calls.
4. **Bridge proof submission**: Subject to EVM block times and gas prices.
