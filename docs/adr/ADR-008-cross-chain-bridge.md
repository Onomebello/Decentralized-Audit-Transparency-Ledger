# ADR-008: Cross-Chain Bridge Design

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-07-01 |
| **Deciders** | Core team |

---

## Context

AuditLedger events are stored on Stellar/Soroban. To enable verification on EVM-compatible chains (Ethereum, Polygon, Arbitrum, etc.), a bridge is needed that can prove the existence and content of a Soroban event on an EVM chain without trusting an intermediary.

The core challenge is making Stellar ledger state (including Soroban contract data) provable on EVM chains, which have a fundamentally different state model.

---

## Decision

The bridge uses a **relayer + EVM verifier contract** architecture:

### Relayer

The relayer (`bridge/relayer`) is an off-chain service that:

1. Polls Stellar for new ledgers
2. Identifies Soroban contract events in each ledger
3. Constructs inclusion proofs using Stellar's ledger header chain
4. Submits proofs to the EVM verifier contract

### EVM Verifier

The verifier (`bridge/evm/Verifier.sol`) is an EVM contract that:

1. Maintains a registry of trusted Stellar network public keys
2. Validates Stellar ledger header signatures
3. Verifies Soroban event inclusion proofs against validated headers
4. Emits events on successful verification

### Proof Structure

```
Proof = {
    ledger_header: StellarLedgerHeader,
    signatures: [StellarSignature],     // Validator signatures
    soroban_tx_proof: SorobanTxProof,   // Transaction inclusion proof
    event_proof: EventProof,            // Event emission proof
    event_data: Event                   // The event being proved
}
```

### Security Model

- Trust is rooted in Stellar validator signatures (not the relayer)
- The relayer cannot forge proofs — it only submits what the validators have signed
- The EVM verifier trusts the Stellar validator set as configured at deployment
- Validator set updates on Stellar must be mirrored to the EVM verifier via governance

---

## Consequences

**Positive:**
- Trust-minimized: security depends on Stellar consensus, not the relayer operator
- Anyone can run a relayer and challenge fraudulent submissions
- EVM verifier is a single, auditable Solidity contract
- Supports any EVM-compatible chain

**Negative:**
- Stellar ledger proofs are large (multiple signatures + headers)
- EVM gas costs for proof verification are significant (~200,000 gas per proof)
- Validator set changes on Stellar require governance actions on the EVM verifier
- Relayer must be highly available to avoid missed proofs

**Mitigations:**
- Proof batching to amortize gas costs
- Governance mechanism on EVM verifier for validator set updates
- Relayer health monitoring and alerting

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| Centralized notary (single trusted signer) | Introduces a trust intermediary; contradicts the trust-minimized goal. |
| IBC (Inter-Blockchain Communication) | Stellar does not support IBC; would require a custom IBC light client. |
| Oracle-based verification (Chainlink) | Adds oracle trust assumptions and latency; higher operational complexity. |
| No bridge (Stellar-only) | Limits adoption; many users want EVM-native verification of audit events. |
