# License & Compliance

## Project License

Stellar Tipz is licensed under the **MIT License**. See [`LICENSE`](../LICENSE) for full terms.

### License Summary

| Component | License |
|-----------|----------|
| Root Project | MIT |
| Smart Contracts (`contracts/`) | MIT |
| Backend (`backend/`) | MIT |
| Frontend (`frontend-scaffold/`) | MIT |
| Documentation (`docs/`) | MIT |

## Dependency Licensing

All dependencies are scanned for license compatibility. This project accepts only:

- **Permissive Licenses**: MIT, Apache-2.0, ISC, BSD, MPL-2.0
- **Rejection Criteria**: GPL, AGPL, LGPL, or other copyleft licenses that would conflict with MIT distribution

### Scanning & Enforcement

Dependency licenses are verified in CI. Any new dependency introducing an incompatible copyleft license will cause the build to fail.

**To check licenses locally:**

```bash
# Frontend
cd frontend-scaffold
npm ls --depth=0

# Backend
cd ../backend
npm ls --depth=0

# Contracts (Rust)
cd ../contracts
cargo tree
```

## Attribution & Notices

Where required by dependency terms, attributions are maintained in [`NOTICES.md`](./NOTICES.md).

## Compliance Issues

If you find a license compliance issue, please report it:

1. Check that the issue is a genuine conflict (e.g., GPL dependency in MIT project)
2. Open an issue with the label `legal` describing the conflicting dependency and license
3. Include the version and source (npm, crates.io, etc.)

---

For questions, see [Contributing](./CONTRIBUTING.md#review-criteria).
