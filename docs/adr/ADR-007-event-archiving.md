# ADR-007: Event Archiving Strategy

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-07-01 |
| **Deciders** | Core team |

---

## Context

The append-only log grows monotonically with every event. Even with `global_max_logs` caps, storage costs and query performance degrade over time. Operators need a mechanism to archive old events and, optionally, purge them from contract state.

Requirements:
- Events must remain verifiable after archiving (tamper evidence must be preserved)
- Archiving should not require contract changes or expensive on-chain operations
- Archived events should be retrievable for audit purposes
- The process must be safe to run while the contract is live

---

## Decision

Archiving uses a **two-phase off-chain orchestration** pattern:

### Phase 1: Archive

An off-chain archive service scans contract events in batches, computes an archive Merkle root over a range of events, and stores the events in external cold storage (S3, GCS, or IPFS):

```
Archive Root = Merkleize(Events[Range])
              → Stored in cold storage
              → Emitted as off-chain event for audit trail
```

The archive service is idempotent: running it twice over the same range produces the same root.

### Phase 2: Purge (Optional)

After archiving is confirmed, the operator may call `purge_archived_events` on the contract to remove archived events from on-chain state. The purge function accepts a range parameter and emits a governance event recording the purged range.

```
Contract State Before: Events[0..N] (full log)
Contract State After:  Events[0..A-1] removed, Events[A..N] remain
```

The archive root is stored off-chain; anyone can verify that purged events existed and were correctly archived by recomputing the root from cold storage.

---

## Consequences

**Positive:**
- Contract storage costs are bounded; operators can reclaim state for active events
- Tamper evidence is preserved via the archive Merkle root
- No contract changes needed for basic archiving (purge function is optional)
- Cold storage is cheap and durable

**Negative:**
- Archive verification requires off-chain computation of the Merkle root
- Purged events are no longer queryable from the contract directly
- Archive service must be reliable and monitored

**Mitigations:**
- Archive roots are published to a public location (e.g., a GitHub Releases asset or IPFS)
- The archive service runs as a sidecar in the Docker Compose stack
- Alerting is configured for archive job failures

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| On-chain event pruning (delete oldest) | Breaks the immutability guarantee; gaps in event sequence. |
| No archiving (keep all events forever) | Unbounded storage growth; eventual contract bloat and high costs. |
| Archive to separate Soroban contract | Higher complexity, cross-contract calls, and gas overhead. |
| Snapshot-based archiving (state export) | Loses per-event granularity; suitable only for full contract migration. |
