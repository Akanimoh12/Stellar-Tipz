# Local Development Setup

Complete guide to setting up Stellar Tipz for local development.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18+ | Frontend build tooling |
| **npm** | 9+ | Package management |
| **Rust** | 1.74+ | Smart contract development |
| **Cargo** | 1.74+ | Rust package manager |
| **Soroban CLI** | 21.0+ | Contract build, deploy, invoke |
| **Git** | 2.30+ | Version control |
| **Freighter** | Latest | Stellar wallet (browser extension) |

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

# Install Soroban CLI
cargo install --locked soroban-cli
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
soroban keys generate tipz-dev --network testnet

# Fund the account via Friendbot
curl "https://friendbot.stellar.org?addr=$(soroban keys address tipz-dev)"

# Deploy the contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tipz.wasm \
  --source tipz-dev \
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
# CONTRACT_ID=<your-deployed-contract-id>
# REACT_APP_NETWORK=TESTNET

# Start development server
npm start
```

The app will be available at **http://localhost:9000**.

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
| `cd frontend-scaffold && npm start` | Start dev server (port 9000) |
| `cd frontend-scaffold && npm run build` | Production build |
| `cd frontend-scaffold && npx tsc --noEmit` | Type-check without emitting |

---

## 7. Troubleshooting

### `npm install` fails with peer dependency errors

```bash
npm install --legacy-peer-deps
```

This is expected — the Stellar SDK has some peer dependency conflicts that are safe to ignore.

### Soroban CLI not found after install

```bash
source $HOME/.cargo/env
# or restart your terminal
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
