# Threat Model

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-07-01 |
| **Deciders** | Core team |

## Methodology

This threat model follows the STRIDE methodology and covers the AuditLedger contract, bridge, off-chain services, and SDKs.

## Assets

| Asset | Description | Criticality |
|-------|-------------|-------------|
| Event Data | Immutable event records stored on-chain | High |
| Owner Key | Key controlling governance functions | High |
| Contract State | Event counts, caps, TTL settings | Medium |
| Bridge Proofs | Cross-chain inclusion proofs | Medium |
| API Credentials | Keys for off-chain service access | Medium |

## Threat Analysis

### Spoofing

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Attacker impersonates contract owner | High | Low | `require_auth()` on all governance functions; multi-sig recommended for production |
| Attacker forges event submission | Medium | Low | Events are signed by Stellar transaction authentication |
| Attacker impersonates API client | Medium | Medium | API keys with scoped permissions; rate limiting |

### Tampering

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Attacker modifies historical events | Critical | Very Low | Append-only log; content-addressed IDs; cryptographic chaining |
| Attacker alters logging caps | Medium | Low | Only owner can modify caps; events emitted for all governance changes |
| Attacker modifies bridge proofs | Medium | Low | Proofs verified on-chain by EVM verifier contract |

### Repudiation

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Submitter denies posting an event | Medium | Low | All events carry submitter address; Stellar transaction trace available |
| Owner denies governance action | Low | Low | Typed Soroban events emitted for every governance function call |

### Information Disclosure

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Sensitive data leaked in metadata | Medium | Medium | Metadata schema should avoid PII; off-chain consumers filter as needed |
| Contract state enumeration | Low | High | All events are public by design; no expectation of privacy on-chain |

### Denial of Service

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Event log spam | Medium | Medium | `global_max_logs` and per-event caps; configurable limits |
| Storage exhaustion via metadata | Medium | Medium | Metadata size bounded by Soroban contract limits |
| Off-chain service flooding | Low | Medium | Rate limiting on APIs; WS connection limits |

### Elevation of Privilege

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Non-owner calls governance functions | High | Very Low | `require_auth()` enforced at contract level |
| Attacker escalates from read-only to write access | High | Low | API services separate read/write concerns; no contract write path exposed via APIs |

## Attack Trees

### Event Tampering Attack

```
1. Gain write access to contract state
   1.1 Compromise owner key
       - Phishing attack
       - Key leakage via env vars
       - Compromised CI/CD pipeline
   1.2 Exploit contract vulnerability
       - Reentrancy (not applicable to Soroban)
       - Integer overflow (mitigated by checked arithmetic)
       - Logic error in governance functions
```

### Cross-Chain Fraud Attack

```
1. Submit fraudulent proof to EVM verifier
   1.1 Forge Stellar ledger signature (infeasible)
   1.2 Exploit verifier contract bug
       - Replay attack (mitigated by nonce tracking)
       - Proof validation bypass
   1.3 Compromise relayer
       - Modify relayer binary
       - Manipulate relayer configuration
```

## Assumptions and Dependencies

- Stellar consensus protocol provides ledger finality
- Soroban runtime enforces contract isolation
- EVM verifier is deployed on a chain with sufficient finality guarantees
- Off-chain operators run software obtained from this repository
