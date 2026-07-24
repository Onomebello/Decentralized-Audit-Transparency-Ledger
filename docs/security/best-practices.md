# Security Best Practices

## For Contract Developers

### Code Reviews

- All contract changes must be reviewed by at least one maintainer
- Reviewers should verify `require_auth()` coverage for all governance functions
- Pay special attention to boundary conditions: zero caps, equal min/max values, empty metadata
- Verify that no panic paths can be triggered by untrusted input

### Testing

```bash
# Run full test suite before merging
cargo test

# Verify no warnings
cargo clippy -- -D warnings

# Check formatting
cargo fmt --check
```

### Dependency Management

- Run `cargo audit` on every CI run to detect known vulnerabilities
- Pin dependency versions in `Cargo.toml`
- Review dependency diffs when updating crates
- Minimize the number of direct dependencies

## For Operators

### Contract Deployment

1. Generate a dedicated owner key (do not reuse existing keys)
2. Initialize the contract with conservative `global_max_logs`
3. Verify deployment by reading back contract state
4. Store owner key in a hardware wallet or HSM

### Environment Variables

```bash
# Never commit .env files
echo ".env" >> .gitignore

# Use a secrets manager for production secrets
# Avoid passing secrets via command-line arguments
```

### Monitoring

- Monitor governance event topics for unexpected activity
- Set up alerts for contract storage growth rate
- Monitor relayer health endpoint for bridge liveness
- Track failed auth attempts on off-chain services

## For API Users

### Authentication

- Use API keys with the minimum required permissions
- Rotate API keys regularly
- Never embed API keys in client-side code

### Data Handling

- Do not store sensitive personal data in event metadata
- Encrypt sensitive metadata off-chain before embedding if absolutely necessary
- Verify event data independently using Soroban RPC reads

## For Bridge Relayer Operators

- Run the relayer in a trusted environment
- Monitor relayer logs for proof submission failures
- Verify EVM verifier contract address matches the deployed version
- Keep the relayer binary up to date with the latest release
