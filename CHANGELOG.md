# Changelog

All notable changes to Stellar Tipz are documented here. The repository does not currently publish Git tags, so this first populated section records the current integration history from merged pull requests on `test-implement-drips`. Future release tags should add dated sections above it.

## [Unreleased] - 2026-11-20

### Added
- Accessibility and keyboard-navigation audits across the frontend (#1822).
- Deployment, monitoring, rollback and production-operations hardening (#1794, #1796, #1815).
- Security hardening, vulnerability tests and supply-chain protections (#1793, #1817).
- Backend health, observability, email and module-level test coverage improvements (#1798, #1799).
- Expanded Storybook coverage and frontend component stories (#1811).

### Changed
- Split large analytics, worker, contract and backend modules into smaller focused units (#1807, #1809, #1820, #1825).
- Improved typed backend boundaries and test budget baselines (#1803).
- Refined tip/profile UI behavior and financial flows (#1813).
- Consolidated developer tooling: root Compose profiles, one root Makefile, and coverage policy under `config/`.

### Fixed
- Reserved username handling and several backend correctness issues (#1792).
- Contract unwrap/error-handling issues and batch-tip edge cases (#1806, #1808).
- Keyboard navigation, accessibility and implementation regressions merged on 2026-11-20 (#1821, #1826).
