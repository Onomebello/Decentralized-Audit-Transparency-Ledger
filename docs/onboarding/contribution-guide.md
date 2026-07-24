# Contribution Guide

This guide covers everything you need to contribute to the Decentralized Audit & Transparency Ledger: branching strategy, coding standards, testing requirements, the pull request workflow, and the bounty program.

For getting your environment running first, see the [Setup Guide](./setup-guide.md).

---

## Code of Conduct

All contributors are expected to follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Be respectful, inclusive, and constructive in issues, pull requests, and discussions.

---

## Before You Start

### Sync with upstream

Always base your work on the latest upstream default branch:

```bash
git fetch upstream
git checkout master
git merge upstream/master
```

### Check existing issues

Before opening a new issue or starting work, search existing issues to avoid duplicating effort. If you have a new idea, open an issue first and wait for a maintainer to confirm scope before starting implementation.

---

## Branch Naming

Use one of these prefixes, followed by a short kebab-case description:

| Prefix | When to use |
|---|---|
| `feature/<description>` | New functionality |
| `bugfix/<description>` | Bug fixes |
| `docs/<description>` | Documentation-only changes |
| `test/<description>` | Adding or improving tests with no logic changes |
| `refactor/<description>` | Code restructuring without behavior changes |

Examples:

```bash
git checkout -b feature/rate-limit-enforcement
git checkout -b bugfix/integer-overflow-log-events
git checkout -b docs/add-onboarding-guides
git checkout -b test/zero-global-max-logs-edge-case
```

---

## Coding Standards

### Rust

- Run `cargo fmt` before committing. Pull requests must pass `cargo fmt --check`.
- Run `cargo clippy -- -D warnings`. Fix warnings rather than suppressing them.
- Follow standard Rust naming conventions:
  - `snake_case` for functions, methods, variables, and modules.
  - `PascalCase` for structs, enums, traits, and type aliases.
  - `SCREAMING_SNAKE_CASE` for constants and statics.
- Keep functions focused and small. Prefer explicit error handling with `ContractError` variants over panics in production paths.
- Add doc comments (`///`) to all public functions, structs, enums, and traits. Comment non-obvious logic inline, but avoid comments that just restate the code.
- Do not commit secrets, private keys, `.env` files, or generated build artifacts.

### TypeScript / Node.js (api/, bridge/, services/, tools/, ui/)

- Follow the existing style in each workspace (formatting is defined per-package).
- Add JSDoc comments to exported functions and types.
- Prefer `async/await` over raw Promise chains for readability.

### Commit Messages

Use the conventional commits format: `<type>: <short description>`

| Type | Use for |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `test` | Adding or updating tests |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore` | Build process, tooling, or dependency changes |

Examples:

```
feat: add rate-limit enforcement per submitter
fix: prevent integer overflow in log_events batch
docs: add deployment guide for mainnet
test: cover zero global_max_logs edge case
```

---

## Testing Requirements

### Baseline checks (required before every PR)

```bash
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

### What to test

Every change that touches contract logic or query behavior must include tests for:

- **Success paths** — the normal, expected case
- **Authorization failures** — non-owner calling governance functions, unauthenticated submitters
- **Validation failures** — invalid arguments, out-of-range values, empty inputs
- **Boundary conditions** — zero max logs, max equal to current count, cap removal after zero-lock

### Where tests live

| File | Purpose |
|---|---|
| `src/test.rs` | Core unit and integration tests (22+ tests) |
| `src/boundary_tests.rs` | Edge cases and boundary conditions |
| `src/regression_tests.rs` | Tests that pin fixed bugs against regressions |
| `src/concurrent_tests.rs` | Concurrent event logging scenarios |
| `src/fee_tests.rs` | Fee and TTL storage behavior |
| `src/fuzz.rs` | Fuzz testing for contract inputs |
| `src/proptest.rs` | Property-based tests using the `proptest` crate |
| `tests/integration_testnet.rs` | Integration tests that run against a live testnet node |

### Useful test commands

```bash
# Run a specific test
cargo test test_log_event

# Run all tests in a specific file/module
cargo test boundary

# Show stdout (useful for debugging)
cargo test -- --nocapture

# Run with all features
cargo test --all-features
```

### Coverage target

New and modified code should aim for 90%+ test coverage. If coverage cannot be added for a change (e.g., a WASM-only panic path), explain why in the pull request description.

---

## Pull Request Workflow

### 1. Push your branch

```bash
git push -u origin feature/your-feature-name
```

### 2. Open the PR

Open a pull request against `master` (or the active feature branch if the maintainers have specified one). Use the template below.

**PR title:** keep it under 70 characters and match your commit type:

```
feat: add per-submitter rate limit enforcement
fix: prevent integer overflow in batch log_events
docs: add onboarding setup guide
```

**PR description template:**

```markdown
## Summary
<!-- What changed and why? -->

## Testing
<!-- What commands did you run? What scenarios did you test? -->
- [ ] `cargo fmt --check` passes
- [ ] `cargo clippy -- -D warnings` passes
- [ ] `cargo test` passes
- [ ] New behavior has test coverage
- [ ] Public APIs and non-obvious logic are documented
- [ ] No secrets, `.env` files, or generated artifacts committed

## Related Issues
<!-- Closes #<issue-number> -->
```

### 3. CI checks

Every PR runs the GitHub Actions workflow which:

1. Installs the Rust toolchain via `dtolnay/rust-toolchain`
2. Checks formatting with `cargo fmt --check`
3. Lints with `cargo clippy`
4. Builds with `cargo build`
5. Runs the full test suite with `cargo test`
6. Scans dependencies for known vulnerabilities with `cargo audit --deny warnings`

The PR cannot be merged until all checks pass.

### 4. Review

- At least **1 maintainer approval** is required.
- Address all review comments with additional commits.
- When all comments are resolved, re-request review.
- Keep discussions constructive and explain trade-offs when accepting or declining suggestions.

### 5. Merge

The maintainer will squash-merge once CI is green and approval is given. Delete your branch after merging.

---

## Issue Tracking and Bounties

### Claiming an issue

1. Find an open issue labelled `bounty` or `good first issue`.
2. Comment "I'd like to work on this" — a maintainer will assign it to you.
3. If you can no longer continue, comment promptly so someone else can pick it up.

### Bounty point tiers

| Difficulty | Points | Example |
|---|---|---|
| High | 200 | Implement global vs. per-event logging limits |
| Medium | 150 | Write edge-case tests for boundary conditions |
| Trivial | 100 | Standardize metadata structure |

Points are awarded based on implementation quality, test coverage, documentation, review responsiveness, and maintainer acceptance.

---

## Docs-Only Changes

If your PR only changes documentation (under `docs/`, `README.md`, or inline doc comments):

- You still need to run `cargo fmt --check` and `cargo clippy -- -D warnings` to pass CI.
- No test changes are required, but if a doc example contains a code block that should be runnable, make sure it compiles.

---

## Security Issues

Do not open a public GitHub issue for security vulnerabilities. Instead, follow the responsible disclosure process described in [docs/security-audit.md](../security-audit.md) or email the maintainers directly.

---

## What to Read Next

- [Setup Guide](./setup-guide.md) — get your environment running
- [Architecture Overview](./architecture-overview.md) — understand the codebase structure
- [Troubleshooting Guide](./troubleshooting-guide.md) — unblock common errors
- [docs/error-reference.md](../error-reference.md) — all 18 contract error codes
