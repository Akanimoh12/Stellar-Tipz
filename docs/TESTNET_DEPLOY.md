# Testnet Deployment Runbook

This guide walks through deploying Stellar Tipz to the Stellar Testnet, including smart contract and frontend deployment.

## Prerequisites

### Required Tools

1. **Soroban CLI** - Install and configure for Stellar Testnet
   ```bash
   cargo install --locked soroban-cli
   ```

2. **Rust Toolchain** - Required to build Soroban contracts
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

3. **Node.js** - For frontend builds (v18+)
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

4. **Stellar Testnet Account** - With enough XLM to cover deployment costs
   - Free account: Visit [Friendbot](https://friendbot.stellar.org) to fund a new account
   - Account details needed: Stellar public key

## Step-by-Step Deployment

### Step 1: Prepare Environment Variables

Create `.env.staging` in the `frontend-scaffold/` directory (copy from `.env.example`):

```bash
cd frontend-scaffold
cp .env.example .env.staging
```

Edit `.env.staging` with your testnet configuration:

```bash
# Soroban RPC endpoint - use Stellar's testnet RPC
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Horizon API endpoint
VITE_HORIZON_URL=https://horizon-testnet.stellar.org

# Stellar testnet network passphrase
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Will be filled after contract deployment
VITE_CONTRACT_ID=

# Stellar testnet
VITE_NETWORK=TESTNET

# Your deployment domain (for CORS and canonical URLs)
VITE_APP_URL=https://your-staging-domain.com

# Optional: Sentry DSN for error tracking
VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

### Step 2: Compile the Smart Contract

From the project root:

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
cd ..
```

**Expected Output:**
- WASM file generated at: `contracts/target/wasm32-unknown-unknown/release/tipz_contract.wasm`
- File size: Typically 200-300 KB (before optimization)

**Troubleshooting:**
- If build fails with "target not found": Run `rustup target add wasm32-unknown-unknown`
- Check Rust version: `rustc --version` (requires Rust 1.70+)

### Step 3: Deploy the Smart Contract

From the project root, run the deployment script:

```bash
./scripts/deploy-testnet.sh [KEY_NAME]
```

**Parameters:**
- `KEY_NAME` (optional): Soroban key alias for deployment (default: "tipz-deployer")

**Full deployment with build:**
```bash
./scripts/deploy-testnet.sh --build tipz-deployer
```

**Expected Output:**
```
=== Stellar Tipz — Testnet Deployment ===

Using Wasm: contracts/target/wasm32-unknown-unknown/release/tipz_contract.wasm
Deployer address: GXYZ...
Account funded.

Deploying to testnet...

=== Deployment Successful ===
Contract ID: CABC...DEFG (56-character contract ID)

Initializing contract...
Contract initialized with 2% fee.
Native token SAC: CDLZ...

=== Done ===
Save this in your frontend-scaffold/.env as:
  VITE_CONTRACT_ID=CABC...DEFG
```

**Save the Contract ID** - You'll need it in the next step.

**Troubleshooting:**
- "soroban CLI not found": Reinstall soroban-cli with `cargo install --locked soroban-cli`
- "Wasm file not found": Ensure contract was built in Step 2
- "Friendbot rate limit exceeded": Wait 5 minutes and retry, or fund manually via Stellar Lab

### Step 4: Update Frontend Environment

Update `.env.staging` with the Contract ID from Step 3:

```bash
VITE_CONTRACT_ID=CABC...DEFG
```

Also update `.env` for local development if needed:
```bash
cp frontend-scaffold/.env.staging frontend-scaffold/.env
```

### Step 5: Build the Frontend

From the project root:

```bash
cd frontend-scaffold
npm install  # Install dependencies if not already done
npm run build
```

**Expected Output:**
```
✓ 1234 modules transformed.
frontend.js   95.2 kB / 32.1 kB
styles.css    12.4 kB / 3.2 kB

Your application is ready to be deployed!
```

**Output location:** `frontend-scaffold/build/`

**Troubleshooting:**
- Environment variables not found: Verify `.env.staging` is in the `frontend-scaffold/` directory
- TypeScript errors: Run `npm run lint -- --fix` to auto-fix style issues

### Step 6: Deploy Frontend to Vercel (or Your Host)

#### Option A: Vercel Deployment (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login and deploy:
   ```bash
   cd frontend-scaffold
   vercel --prod
   ```

3. Follow the Vercel CLI prompts to configure your project

#### Option B: Manual Deployment

1. Build the static files:
   ```bash
   cd frontend-scaffold
   npm run build
   ```

2. Deploy `build/` directory to your hosting service (AWS S3, Netlify, GitHub Pages, etc.)

3. Configure environment variables in your hosting platform's settings

### Step 7: Verify Deployment

Run the verification script to test the deployed application:

```bash
npx ts-node scripts/verify-deployment.ts
```

**Verification Checks:**
- [ ] Frontend loads successfully
- [ ] Environment variables are properly configured
- [ ] RPC endpoint is reachable
- [ ] Security headers are present
- [ ] Service Worker registers

**Expected Output:**
```
✓ Frontend loads
✓ API health
✓ Environment variables
✓ HTML content valid
✓ Security headers
All checks passed!
```

**Troubleshooting Verification Failures:**
- "Frontend returns status 404": Verify deployment URL and domain configuration
- "Environment variables missing": Check .env file in deployment environment
- "RPC endpoint unreachable": Verify VITE_SOROBAN_RPC_URL points to a reachable testnet RPC

### Step 8: Post-Deployment Validation

1. **Test the application manually:**
   - Visit your deployed URL
   - Create a test account
   - Send a small test tip
   - Verify transaction appears on-chain

2. **Check contract initialization:**
   ```bash
   soroban contract invoke \
     --id CABC...DEFG \
     --network testnet \
     -- \
     get_admin
   ```

3. **Monitor logs:**
   - Check Vercel or hosting platform logs for runtime errors
   - Monitor Sentry (if configured) for application errors

## Common Failure Modes and Fixes

### "VITE_CONTRACT_ID is required"
**Cause:** Contract ID not set in environment variables
**Fix:** 
1. Ensure contract deployed successfully in Step 3
2. Copy the Contract ID from deployment output
3. Add to `.env.staging`: `VITE_CONTRACT_ID=CABC...DEFG`
4. Rebuild frontend

### "Invalid contract address format"
**Cause:** Contract ID malformed or wrong address type
**Fix:**
- Verify Contract ID starts with 'C' and is 56 characters
- Don't use account addresses (start with 'G') or transaction hashes
- Copy directly from deployment script output

### "RPC endpoint unreachable"
**Cause:** Soroban RPC endpoint is down or network issues
**Fix:**
1. Test endpoint manually: `curl https://soroban-testnet.stellar.org`
2. Check Stellar status page: https://status.stellar.org
3. Use backup RPC if available
4. Wait a few minutes and retry

### "Insufficient funds for deployment"
**Cause:** Deployer account doesn't have enough XLM
**Fix:**
1. Fund the account via Friendbot: https://friendbot.stellar.org?addr=YOUR_ADDRESS
2. Verify funding: `soroban account balance --source DEPLOYER_KEY --network testnet`
3. Retry deployment

## Resetting / Redeploying

### To redeploy to a new contract ID:

1. Repeat Step 3 with a new key name:
   ```bash
   ./scripts/deploy-testnet.sh --build new-deployment
   ```

2. Update `.env.staging` with new Contract ID

3. Rebuild and redeploy frontend (Steps 5-6)

### To clear Soroban keys:

```bash
# List all keys
soroban keys ls

# Remove a specific key
soroban keys rm KEY_NAME
```

## Performance Considerations

- **Contract size:** Keep under 350 KB to avoid deployment issues
- **Bundle size:** Target < 200 KB gzipped (check with `npm run build`)
- **RPC calls:** Batch operations where possible to reduce transaction count
- **Fee configuration:** Currently set to 2% in contract initialization

## Monitoring and Debugging

### View Recent Transactions:

```bash
# Check account transactions on testnet
soroban account show DEPLOYER_ADDRESS --network testnet
```

### Contract Balance:

```bash
soroban contract invoke \
  --id CABC...DEFG \
  --source DEPLOYER_KEY \
  --network testnet \
  -- \
  get_balance \
  --user USER_ADDRESS
```

### Enable Debug Logging:

Set environment variable before build:
```bash
VITE_DEBUG=true npm run build
```

## Additional Resources

- [Stellar Testnet Documentation](https://developers.stellar.org/networks/testnet-public)
- [Soroban Documentation](https://soroban.stellar.org)
- [Vercel Deployment Guide](https://vercel.com/docs/deployments/overview)
- [Stellar Lab - Testnet Explorer](https://laboratory.stellar.org)

## Support

For deployment issues:
1. Check this runbook for known failure modes
2. Review CI/CD logs in `.github/workflows/deploy-testnet.yml`
3. Check Stellar Discord: https://discord.gg/stellardev
4. Create an issue with deployment logs and contract ID


## On-chain artifact verification (issue #1366)

The deploy workflow now runs `scripts/verify-contract-deployment.sh` **before** persisting the deployed ID. The check compares the SHA-256 of the exact optimized WASM file to the on-chain contract hash and calls `get_version` to require version 4. A mismatch fails the deployment job. To verify an existing deployment manually:

```bash
bash scripts/verify-contract-deployment.sh "$CONTRACT_ID" \
  contracts/target/wasm32-unknown-unknown/release/tipz_contract.optimized.wasm \
  testnet 4
```

Successful CI deployment writes the public `deployments/testnet.json` manifest with the on-chain contract ID, WASM hash, source commit and interface version; the optional `TESTNET_DEPLOYER_PUBLIC_KEY` variable identifies the deployment operator. Do not commit private deployer seeds, environment files, or unverified addresses. The manifest only becomes available after a real verified deployment, not by inventing a placeholder contract address. In production, the backend checks `CONTRACT_ID` and `EXPECTED_CONTRACT_VERSION` before starting its listener, and rejects an incompatible on-chain version. The manifest records the latest ledger observed at verification time (`verifiedAtLedger`), **not** the exact ledger in which the deployment transaction executed.
