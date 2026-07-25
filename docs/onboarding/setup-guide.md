# Developer Setup Guide

This guide gets you from zero to a running local environment. Follow the steps in order.

---

## Prerequisites

Install the following tools before cloning the repo.

### Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Add the WASM compilation target (required to build the Soroban contract):

```bash
rustup target add wasm32-unknown-unknown
```

Verify:

```bash
rustc --version
cargo --version
```

### Soroban CLI

```bash
cargo install soroban-cli --features opt
```

Verify:

```bash
soroban --version
```

### Node.js 20+

Required for the UI, metrics exporter, and bridge services.

```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Or download directly from https://nodejs.org/
```

Verify:

```bash
node --version   # should be v20.x or higher
npm --version
```

### Docker & Docker Compose

Required for the local monitoring and UI stack.

- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Compose), or
- Install [Docker Engine](https://docs.docker.com/engine/install/) + [Docker Compose plugin](https://docs.docker.com/compose/install/) on Linux.

Verify:

```bash
docker --version
docker compose version
```

---

## Clone and Build

```bash
git clone https://github.com/daddygokings-art/Decentralized-Audit-Transparency-Ledger.git
cd Decentralized-Audit-Transparency-Ledger
```

Build the contract:

```bash
cargo build
```

Build the WASM binary (used for deployment):

```bash
cargo build --target wasm32-unknown-unknown --release
```

The output will be at:

```
target/wasm32-unknown-unknown/release/audit_ledger.wasm
```

---

## Run the Tests

```bash
# Full test suite
cargo test

# Run a single test by name
cargo test test_log_event

# Show stdout from tests (useful for debugging)
cargo test -- --nocapture
```

All 22+ tests should pass on a clean clone.

---

## Lint and Format

The CI enforces formatting and lint on every push. Run these before committing:

```bash
# Check formatting (does not modify files)
cargo fmt --check

# Fix formatting in place
cargo fmt

# Lint (all warnings treated as errors)
cargo clippy -- -D warnings
```

---

## Environment Configuration

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```
CONTRACT_ID=<your deployed contract ID>
```

All other values have working defaults for testnet development:

| Variable | Default | Description |
|---|---|---|
| `CONTRACT_ID` | _(required)_ | Deployed Soroban contract ID |
| `RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Stellar network passphrase |
| `SCRAPE_INTERVAL_MS` | `15000` | Metrics polling interval |
| `EVENT_TYPES` | `payment,refund,transfer` | Event types to track |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |

---

## Deploy to Testnet

### 1. Fund a testnet account

If you do not have a funded testnet account, use Friendbot:

```bash
curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
```

### 2. Run the deploy script

```bash
export SOROBAN_SECRET_KEY="<your_testnet_secret_key>"
./scripts/deploy_testnet.sh
```

The script builds the WASM binary and deploys it to testnet. Copy the printed contract ID into your `.env`.

### 3. Initialize the contract

The contract must be initialized exactly once after deployment:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <owner_secret_key> \
  --network testnet \
  -- \
  initialize \
  --owner <owner_address> \
  --global_max_logs 100000
```

Calling `initialize` a second time will panic with `AlreadyInitialized`.

---

## Start the Local Docker Stack

The Docker Compose file wires up the full off-chain monitoring and UI stack:

```bash
docker compose up --build
```

Once running:

| Service | URL |
|---|---|
| UI | http://localhost:3001 |
| REST API | http://localhost:3002 |
| Grafana | http://localhost:3000 (admin / `$GRAFANA_PASSWORD`) |
| Prometheus | http://localhost:9090 |
| Metrics exporter | http://localhost:8000/metrics |
| Bridge relayer health | http://localhost:8080/healthz |

Stop all services:

```bash
docker compose down
```

Remove volumes (wipes Prometheus and Grafana data):

```bash
docker compose down -v
```

---

## Repository Structure

```
.
├── src/                    # Soroban contract source + all tests
│   ├── lib.rs              # Main contract logic
│   ├── test.rs             # Core unit/integration tests (22+ tests)
│   ├── boundary_tests.rs   # Edge-case and boundary tests
│   ├── regression_tests.rs # Regression test suite
│   └── ...                 # Additional test modules
├── api/
│   ├── rest/               # REST API adapter (Node.js)
│   ├── graphql/            # GraphQL API service (Node.js)
│   └── ws/                 # WebSocket event stream (Node.js)
├── bridge/
│   ├── evm/                # Solidity verifier contract
│   └── relayer/            # Cross-chain bridge relayer (Node.js)
├── docs/                   # Project documentation
│   ├── onboarding/         # ← You are here
│   ├── architecture.md
│   ├── api.md
│   └── ...
├── monitoring/             # Prometheus + Grafana config
├── scripts/                # deploy_testnet.sh, benchmark.sh
├── sdk/
│   ├── js/                 # JavaScript/TypeScript SDK
│   └── python/             # Python SDK
├── services/
│   └── notifier/           # Alert/notification service (Node.js)
├── tools/
│   ├── backup/             # Backup and restore scripts
│   └── metrics-exporter/   # Prometheus metrics exporter (Node.js)
├── ui/                     # Next.js audit viewer frontend
├── Cargo.toml              # Rust workspace manifest
├── docker-compose.yml      # Local stack definition
└── .env.example            # Environment variable template
```

---

## What to Read Next

- [Architecture Overview](./architecture-overview.md) — how all components fit together
- [Contribution Guide](./contribution-guide.md) — branching, testing, and PR workflow
- [Troubleshooting Guide](./troubleshooting-guide.md) — common errors and fixes
- [docs/api.md](../api.md) — full API reference
- [docs/error-reference.md](../error-reference.md) — all 18 contract error codes
