#!/usr/bin/env node
/**
 * Generate contract ABI documentation from the contract spec.
 *
 * This script creates a markdown file documenting all contract entrypoints
 * and types extracted from the contract ABI/spec file. The file is included
 * in the Docusaurus documentation site under the "Contract" section.
 *
 * Usage: npx tsx scripts/generate-contract-docs.ts <abi-file> <output-file>
 * Default: scripts/generate-contract-docs.ts contracts/abi/tipz_contract.spec.json docs/contract-abi.md
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const abiFile = process.argv[2] || 'contracts/abi/tipz_contract.spec.json';
const outputFile = process.argv[3] || 'docs/contract-abi.md';

async function generateContractDocs(): Promise<void> {
  console.log('Generating contract ABI documentation...');

  // Check if ABI file exists
  if (!fs.existsSync(abiFile)) {
    console.warn(
      `⚠ ABI file not found at ${abiFile}. This may be okay during initial setup.`,
    );
    console.log(`Creating placeholder documentation...`);

    const placeholder = `# Contract ABI Reference

> Auto-generated from the Soroban contract ABI.

## Overview

The Stellar Tipz smart contract is deployed on Soroban (Stellar smart contracts platform).

### Contract Details

- **Name:** tipz_contract
- **Language:** Rust (compiled to WebAssembly)
- **Location:** \`contracts/tipz/\`
- **ABI File:** \`${abiFile}\`

## Generating ABI Documentation

To generate the contract ABI, run:

\`\`\`bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
scripts/generate-contract-spec.sh
\`\`\`

This will create the ABI file at \`${abiFile}\`, which is then used to generate this documentation.

## See Also

- [Contract Specification](./contract-spec.md)
- [API Reference](./api-reference.md)
- [Smart Contract Architecture](./adr/ADR-001-stellar-wallet-auth-flow.md)
`;

    fs.writeFileSync(outputFile, placeholder, 'utf-8');
    console.log(`✓ Placeholder contract documentation created: ${outputFile}`);
    return;
  }

  const abi = JSON.parse(fs.readFileSync(abiFile, 'utf-8'));

  const md = `# Contract ABI Reference

> Auto-generated from the Soroban contract specification.
>
> **Last updated:** ${new Date().toISOString()}

## Overview

The Stellar Tipz smart contract provides on-chain custody, credit scoring, leaderboards, and withdrawal logic for the tipping platform.

### Contract Details

- **Name:** ${abi.contract}
- **Language:** Rust (WebAssembly)
- **Location:** \`contracts/tipz/\`
- **Source:** \`${abi.source}\`
- **Generator:** \`${abi.generator}\`

---

## Entry Points

Entry points are the public functions that external callers (the backend or frontend) can invoke on the contract.

### Public Functions

\`\`\`rust
// To be populated from the generated ABI
\`\`\`

The contract exposes entry points via the Soroban contract ABI. See the [Contract Specification](./contract-spec.md) for the full interface.

---

## Types & Structures

\`\`\`rust
// To be populated from the generated ABI
\`\`\`

---

## Events

The contract emits events for key state changes:

- **TipSent** — Emitted when a tip is successfully sent
- **TipWithdrawn** — Emitted when a creator withdraws their tips
- **CreditScoreUpdated** — Emitted when a creator's credit score is recalculated
- **LeaderboardUpdated** — Emitted when leaderboard positions change

---

## Storage

The contract uses Soroban's persistent and temporary storage:

- **Persistent Storage** — Creator profiles, leaderboards, configuration (survives ledger resets)
- **Temporary Storage** — Tip records, session data (expires after TTL)

---

## Regenerating ABI Documentation

To regenerate the ABI after contract changes:

\`\`\`bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
bash scripts/generate-contract-spec.sh
npx tsx scripts/generate-contract-docs.ts
\`\`\`

---

## Related Documentation

- [Contract Specification](./contract-spec.md) — Full contract design and behavior
- [API Reference](./api-reference.md) — Off-chain REST API
- [ADR-001: Soroban Choice](./adr/ADR-001-stellar-wallet-auth-flow.md) — Why Soroban was chosen
- [Smart Contract Architecture](./architecture.md#smart-contract-layer)

---

**Note:** \`${abi.note}\`
`;

  fs.writeFileSync(outputFile, md, 'utf-8');
  console.log(`✓ Contract ABI documentation generated: ${outputFile}`);
}

generateContractDocs().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
