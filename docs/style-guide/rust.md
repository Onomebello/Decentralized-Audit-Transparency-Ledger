# Rust Style Guide

This guide extends the [Rust style guidelines](https://doc.rust-lang.org/nightly/style-guide/) and the project's `rustfmt.toml` configuration.

## Formatting

Rust code is auto-formatted with `rustfmt` using the project's `rustfmt.toml`. Run before committing:

```bash
cargo fmt --check
cargo fmt  # auto-fix
```

## Naming Conventions

| Construct | Convention | Example |
|-----------|-----------|---------|
| Functions, methods, variables | `snake_case` | `log_event`, `total_events` |
| Structs, enums, traits, type aliases | `PascalCase` | `Event`, `EventOrder` |
| Constants, statics | `SCREAMING_SNAKE_CASE` | `MAX_LOG_CAP` |
| Modules | `snake_case` | `event`, `governance` |
| Error variants | PascalCase | `StorageLimitReached` |
| Type parameters | single uppercase | `T`, `E` |

## Documentation

- Use `///` doc comments for all public items: functions, structs, enums, traits, modules
- Include a description, arguments (`* `), return value, and panic conditions
- Use `//` inline comments sparingly — explain *why*, not *what*

```rust
/// Log a single event to the ledger.
///
/// ### Arguments
/// * `submitter` - The address submitting the event
/// * `event_type` - The event type symbol
/// * `metadata` - Opaque metadata bytes
///
/// ### Returns
/// The index of the newly logged event
///
/// ### Panics
/// * `StorageLimitReached` - If the global or per-event cap is reached
pub fn log_event(env: Env, submitter: Address, event_type: Symbol, metadata: Bytes) -> u32 {
```

## Error Handling

- Use `Result<T, E>` for recoverable errors; use `panic!` or `require!` only for invariants
- Define custom error types with `#[contracterror]` for Soroban contracts
- Prefer early returns with `?` over nested error handling
- Avoid `.unwrap()` and `.expect()` in production code (use pattern matching or `?`)

```rust
// Prefer this:
let owner = env.storage().instance().get::<Address>(&OwnerKey)
    .ok_or(Error::NotInitialized)?;

// Not this:
let owner = env.storage().instance().get::<Address>(&OwnerKey)
    .unwrap();
```

## Testing

- Place tests in the same file in a `#[cfg(test)] mod tests` block
- Name tests with `test_` prefix describing the scenario
- Cover: success paths, auth failures, validation failures, boundary conditions

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_event_success() { ... }

    #[test]
    fn test_log_event_rejects_non_owner() { ... }

    #[test]
    fn test_log_event_hits_cap() { ... }
}
```

## Contract-Specific

- All governance functions must call `caller.require_auth()`
- Validate all input parameters before mutating state
- Use `Symbol` for event types, not raw strings
- Emit typed Soroban events for all state-changing operations
- Use `BytesN<32>` for content-addressed IDs
- Keep functions focused: one operation per public function
