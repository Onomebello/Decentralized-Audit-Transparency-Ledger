# Security Model

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-07-01 |
| **Deciders** | Core team |

## Overview

The Decentralized Audit & Transparency Ledger operates under a **trust-minimized security model**. The system is designed to provide tamper-evident audit trails without requiring users to trust any single party. Security properties are enforced at the contract layer, the bridge layer, and the off-chain service layer.

## Trust Assumptions

| Layer | Trust Assumption | Rationale |
|-------|-----------------|-----------|
| Stellar/Soroban Network | Consensus integrity | The contract relies on Stellar consensus to finalize ledgers. A network-level reorg or consensus failure could affect event ordering. |
| Contract Owner | Owner is honest-but-curious | The owner can adjust logging limits, transfer ownership, and set TTL values. Owner cannot alter or delete existing events. |
| Off-chain Operators | Operators follow protocol | Off-chain services (relayer, notifier, APIs) can lie by omission but cannot forge valid on-chain events. |
| EVM Verifier | EVM chain finality | Cross-chain proofs depend on the EVM chain's finality model. |

## Security Properties

### 1. Immutability

Once an event is written to the ledger, its core fields (`index`, `timestamp`, `event_type`, `submitter`, `metadata`) are never overwritten or deleted. The append-only log structure ensures:

- No governance action can retroactively alter historical events
- Content-addressed IDs make tampering detectable
- Sequential `EventOrder` mapping provides ordered access by insertion position

### 2. Tamper Evidence

Each event is identified by a SHA-256 content hash:

```
id = sha256(contract_id || submitter || event_type_bytes || metadata || timestamp || index)
```

Changing any field produces a different ID, making unauthorized modification detectable.

### 3. Access Control

Governance functions are protected by `require_auth()` checks against the stored owner address:

- `owner` is set once during `initialize()`
- `transfer_ownership()` requires authorization from the current owner
- All governance functions emit typed Soroban events for auditability

### 4. Cross-Chain Verification

The bridge relayer constructs inclusion proofs that are verified on-chain by `bridge/evm/Verifier.sol`. This enables independent verification of AuditLedger events on EVM-compatible chains without trusting the relayer.

## Security Boundaries

```
                    ┌─────────────────────┐
                    │   Stellar Network    │
                    │  (Consensus Layer)   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  AuditLedger        │
                    │  Soroban Contract   │
                    │  (Trust-minimized)  │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
   ┌────────▼────────┐ ┌──────▼──────┐ ┌─────────▼─────────┐
   │ Off-chain       │ │ Bridge      │ │ SDKs / APIs       │
   │ Services        │ │ Relayer     │ │ (Read-only by     │
   │ (Notifier, etc) │ │             │ │  default)         │
   └─────────────────┘ └─────────────┘ └───────────────────┘
```

## Key Management

- Owner secret keys must be stored securely (hardware wallet or key management system)
- Off-chain services use separate API keys with minimal required permissions
- No secrets are embedded in the contract or committed to the repository
