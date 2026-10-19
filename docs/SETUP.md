# Local Development Setup

Complete guide to setting up Stellar Tipz for local development.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20+ | Frontend and backend tooling |
| **npm** | 9+ | Package management |
| **Rust** | 1.88+ | Smart contract development |
| **Cargo** | 1.88+ | Rust package manager |
| **Stellar CLI** | Current | Start Quickstart, deploy, and invoke contracts |
| **Git** | 2.30+ | Version control |
| **Docker** | Current with Compose v2 | Local Postgres, Redis, and app services |
| **curl** | Current | Local RPC readiness and account funding |
| **Freighter** | Latest | Stellar wallet (browser extension) |

## One-command local setup

From the repository root, run:

```bash
./scripts/dev-environment.sh up
```

The script starts a local Stellar Quickstart network, builds and deploys the
Soroban contract, initializes it with development accounts, and writes the
generated contract ID into ignored files under `.dev/`. Docker Compose starts
PostgreSQL and Redis, applies Prisma migrations, seeds repeatable sample users,
tips, and leaderboard data, then starts the backend API, indexer, jobs, and
frontend. It prints the local URLs only after Postgres, Redis, the migration and
seed step, contract RPC, API readiness, indexer, jobs, and frontend pass health
checks.

Open the frontend at <http://localhost:3000> and API docs at
<http://localhost:4000/api/v1/docs>. The local test network and signing keys
are scoped to this checkout. Run `./scripts/dev-environment.sh down` to stop
the app and local chain; database volumes remain available for the next run.
Set `TIPZ_STELLAR_PORT`, `TIPZ_API_PORT`, `TIPZ_FRONTEND_PORT`,
`TIPZ_POSTGRES_PORT`, or `TIPZ_REDIS_PORT` to use different host ports.

For a clean database reset, run `docker compose down -v` before starting the
script again. This deletes the local PostgreSQL and Redis data volumes.

### Local environment troubleshooting

- **Docker is unavailable:** start Docker Desktop or the Docker service, then
  check `docker compose version` and `stellar doctor` before retrying.
- **A port is already in use:** set one or more of `TIPZ_STELLAR_PORT`,
  `TIPZ_POSTGRES_PORT`, `TIPZ_REDIS_PORT`, `TIPZ_API_PORT`, or
  `TIPZ_FRONTEND_PORT`, then rerun the startup command.
- **The contract cannot deploy:** inspect the local chain with
  `stellar --config-dir .dev/stellar container logs tipz-local` and verify
  that Rust 1.88 and the `wasm32-unknown-unknown` target are available.
- **Migrations or seeding fail:** inspect `docker compose logs migrate`; after
  fixing the reported problem, rerun `./scripts/dev-environment.sh up`.
- **The API never becomes ready:** inspect `docker compose logs api indexer`
  and `docker compose ps`. The readiness endpoint checks PostgreSQL, Redis,
  local Soroban RPC, and indexer lag at `/health/ready`.
- **Frontend build dependencies fail to install:** check the Docker build
  output and confirm the checkout can reach npm's package registry.

---

## 1. Clone & Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/stellar-tipz.git
cd stellar-tipz

# Set upstream
git remote add upstream https://github.com/akan_nigeria/stellar-tipz.git
```

---

## 2. Smart Contract Setup

### Install Rust & Soroban

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Add the Wasm target
rustup target add wasm32-unknown-unknown

# Install Stellar CLI
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
```

### Build the Contract

```bash
cd contracts

# Build
cargo build

# Build optimized Wasm binary
cargo build --target wasm32-unknown-unknown --release

# Run tests
cargo test

# Check formatting
cargo fmt -- --check

# Run linter
cargo clippy -- -D warnings
```

### Deploy to Testnet

```bash
# Generate a testnet keypair (if needed)
stellar keys generate tipz-dev --network testnet --fund

# Deploy the contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tipz.wasm \
  --source-account tipz-dev \
  --network testnet
```

Save the returned **Contract ID** — you'll need it for the frontend.

---

## 3. Frontend Setup

```bash
cd frontend-scaffold

# Install dependencies
npm install --legacy-peer-deps

# Create environment file
cp .env.example .env

# Edit .env with your contract ID
# VITE_CONTRACT_ID=<your-deployed-contract-id>
# VITE_NETWORK=TESTNET

# Start development server
npm run dev
```

The app will be available at **http://localhost:3000**.

`npm run dev` is the recommended Vite workflow for local development in this
repo. `npm start` is only an alias to `vite`, so docs and examples should use
the Vite-style command above.

---

## 4. Freighter Wallet Setup

1. Install the [Freighter browser extension](https://www.freighter.app/)
2. Create or import a wallet
3. Switch to **Testnet**:
   - Open Freighter → Settings → Network → Select "Test Net"
4. Fund your testnet account:
   ```bash
   curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
   ```

---

## 5. Project Structure Quick Reference

```
stellar-tipz/
├── contracts/          # Soroban smart contracts (Rust)
│   └── tipz/           # Main contract crate
├── frontend-scaffold/  # React + TypeScript frontend
│   └── src/            # Application source code
├── docs/               # Project documentation
├── scripts/            # Helper scripts
└── .github/            # CI/CD workflows
```

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full project structure.

---

## 6. Common Commands

### Contract

| Command | Description |
|---------|-------------|
| `cd contracts && cargo build` | Build contracts |
| `cd contracts && cargo test` | Run all contract tests |
| `cd contracts && cargo fmt` | Format Rust code |
| `cd contracts && cargo clippy` | Run Rust linter |
| `cd contracts && cargo build --target wasm32-unknown-unknown --release` | Build optimized Wasm |

### Frontend

| Command | Description |
|---------|-------------|
| `cd frontend-scaffold && npm run dev` | Start dev server (port 3000) |
| `cd frontend-scaffold && npm run build` | Production build |
| `cd frontend-scaffold && npx tsc --noEmit` | Type-check without emitting |

---

## 7. Troubleshooting

### `npm install` fails with peer dependency errors

```bash
npm install --legacy-peer-deps
```

This is expected — the Stellar SDK has some peer dependency conflicts that are safe to ignore.

### Stellar CLI not found after install

```bash
stellar --version
# Add the Stellar CLI install directory to PATH if the command is not found.
```

### Freighter not detected in the app

- Ensure Freighter extension is installed and unlocked
- Refresh the page after installing the extension
- Check that you're on the correct network (Testnet)

### Contract tests fail with "not found"

```bash
# Make sure you're in the contracts/ directory
cd contracts
cargo test
```

### Vite build fails with memory error

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

---

## 8. Editor Setup (Recommended)

### VS Code Extensions

- **rust-analyzer** — Rust language support
- **ESLint** — JavaScript/TypeScript linting
- **Tailwind CSS IntelliSense** — Tailwind autocomplete
- **Prettier** — Code formatting

### Settings

```json
{
  "editor.formatOnSave": true,
  "rust-analyzer.check.command": "clippy",
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

---

## Next Steps

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow
- Read [CONTRACT_SPEC.md](./CONTRACT_SPEC.md) for the smart contract specification
- Read [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md) for frontend conventions
- Browse [open issues](https://github.com/akan_nigeria/stellar-tipz/issues) and pick one to work on
