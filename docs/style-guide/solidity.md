# Solidity Style Guide

## Language Version

Solidity ^0.8.24 (see `bridge/evm/Verifier.sol`).

## Project Structure

```
bridge/evm/
├── Verifier.sol       # Main verifier contract
├── interfaces/        # Interface definitions
├── test/              # Foundry tests
└── script/            # Deployment scripts
```

## Naming Conventions

| Construct | Convention | Example |
|-----------|-----------|---------|
| Contracts, libraries | `PascalCase` | `AuditLedgerVerifier` |
| Functions | `camelCase` | `verifyEvent`, `isVerified` |
| Internal/private functions | `_` prefix | `_recover`, `_validateProof` |
| Modifiers | `camelCase` | `onlyOwner` |
| Events | `PascalCase` | `EventVerified`, `SignersUpdated` |
| Errors | `PascalCase` | `InvalidProof`, `AlreadyVerified` |
| State variables | `camelCase` | `latestAcceptedLedger`, `threshold` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_SIGNER_COUNT` |
| Immutables | `_` prefix + camelCase | `_owner` |

## Layout

Order within a contract:

```
1. // ── Storage ──
2. // ── Events ──
3. // ── Errors ──
4. // ── Constructor ──
5. // ── Modifiers ──
6. // ── Core (external/public) ──
7. // ── Governance (external) ──
8. // ── Internal ──
```

Use NatSpec comments `///` for all public functions and state variables.

## Formatting

No automated formatter is currently configured. Follow these conventions:

- 4-space indentation
- 120 character line limit
- Opening brace on same line for contracts, functions, modifiers
- One blank line between sections (as marked by comments)
- Wrap long parameter lists

```solidity
function verifyEvent(
    uint64 ledgerSeq,
    bytes32 txHash,
    uint32 eventIndex,
    bytes32 eventHash,
    bytes[] calldata signatures
) external returns (bool) {
```

## Types

- Use `uint256` unless gas optimization demands smaller types
- Use `bytes32` for hashes and identifiers
- Use `address` for Ethereum addresses
- Use `calldata` for read-only external function parameters
- Use `memory` for temporary data within functions

## Error Handling

- Use custom errors over `require` with string messages (gas efficient)
- Define error types after events in the contract layout

```solidity
error InvalidProof();
error AlreadyVerified();
error Unauthorized();

function verifyEvent(...) external returns (bool) {
    if (verifiedEvents[eventHash]) revert AlreadyVerified();
    if (validCount < threshold) revert InvalidSignature();
}
```

## Security

- Use `onlyOwner` modifier for governance functions
- Apply checks-effects-interactions pattern
- Use `ecrecover` for signature verification
- Validate all input parameters at function entry
- Use `receive()` and `fallback()` only when necessary
- Avoid `tx.origin` — use `msg.sender`

## Testing

- Use Foundry (forge) for unit and fuzz testing
- Name test contracts with `Test` prefix
- Use `setUp()` for test fixture initialization

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../Verifier.sol";

contract AuditLedgerVerifierTest is Test {
    AuditLedgerVerifier verifier;

    function setUp() public {
        address[] memory signers = new address[](1);
        signers[0] = address(this);
        verifier = new AuditLedgerVerifier(signers, 1);
    }

    function test_verifyEvent_success() public {
        // test implementation
    }
}
```
