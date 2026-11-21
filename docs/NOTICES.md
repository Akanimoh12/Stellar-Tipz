# Third-Party Notices

This document provides attribution and license notices for third-party components included in or distributed with Stellar Tipz.

## Frontend Dependencies

Key frontend dependencies and their licenses:

- **React** (MIT): UI framework
- **Stellar JS SDK** (MIT): Stellar blockchain SDK
- **Vite** (MIT): Build tool
- **TypeScript** (Apache-2.0): Type checker (compatible with MIT via permissive terms)
- **Playwright** (Apache-2.0): End-to-end testing
- **Zustand** (MIT): State management

## Backend Dependencies

Key backend dependencies and their licenses:

- **Express** (MIT): HTTP server framework
- **Prisma** (Apache-2.0): Database ORM
- **TypeScript** (Apache-2.0): Type checker
- **Vitest** (MIT): Test runner
- **Zod** (MIT): Schema validation

## Smart Contract Dependencies

Key contract dependencies and their licenses:

- **Soroban SDK** (Apache-2.0): Stellar smart contract framework
- **Proptest** (MIT): Property-based testing

## Full Dependency List

For a complete list of all dependencies and their licenses, run:

```bash
# Frontend
cd frontend-scaffold && npm ls

# Backend
cd ../backend && npm ls

# Contracts
cd ../contracts && cargo tree
```

## License Compatibility

All included dependencies are compatible with the MIT license. Apache-2.0 dependencies (e.g., Prisma, Playwright, Soroban) are compatible because:

- Apache-2.0 is a permissive license with explicit patent grants
- It does not impose copyleft obligations when bundled with MIT-licensed code
- Users can choose to use these components under either Apache-2.0 or MIT terms

## Questions?

If you have concerns about a specific dependency or license, open an issue labeled `legal`.
