## Description

<!-- Provide a clear and concise description of what this PR does and why it is needed. -->

Closes #<!-- Specify the issue number this PR resolves, e.g. Closes #123 -->

## Linked Issue

- [ ] This PR is linked to an issue and references it above.
- [ ] The issue number is included in the PR title or description.

## Type of Change

Please mark the options that are relevant:

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 🧪 Tests (adding new tests or updating existing tests)
- [ ] 📝 Documentation (changes to documentation/configs only)
- [ ] 🚀 DevOps & CI/CD (changes to workflows, scripts, or templates)

## Changes Made

<!-- List the specific files modified and key changes implemented in this PR. -->

- 
- 
- 

## How to Test

<!-- Describe the steps needed to verify your changes. Include details of your testing environment if relevant. -->

1. `cd frontend-scaffold && npm run typecheck && npm run lint && npm test`
2. `cd backend && npm run typecheck && npm run lint && npm test`
3. Manual verification steps (if applicable):

### Testing Notes

- [ ] I described the commands used to verify the change.
- [ ] I noted any environment or browser setup required for manual testing.

## Checklist

### 💻 Smart Contract Changes (if applicable)
- [ ] Running `cargo fmt -- --check` passes successfully.
- [ ] Running `cargo clippy -- -D warnings` runs without any warnings.
- [ ] All tests pass successfully using `cargo test`.
- [ ] New unit or integration tests have been written to cover the changes.
- [ ] No hardcoded values are present (e.g. addresses, fees) that should be configurable.

### 🎨 Frontend Changes (if applicable)
- [ ] TypeScript compiles cleanly with no errors (`npm run typecheck` or `npx tsc --noEmit`).
- [ ] Running `npm run lint` shows no linting errors.
- [ ] The production build compiles successfully via `npm run build`.
- [ ] Changes verified on local browser environment with Freighter/xBull/Albedo wallet.
- [ ] Responsive design verified (tested on mobile, tablet, and desktop viewport sizes).
- [ ] Keyboard navigation and accessibility (a11y) considerations are addressed.

### ⚙️ General
- [ ] Code follows the project's coding standards and structure guidelines.
- [ ] Self-reviewed the changes to ensure clean code with no commented-out code blocks.
- [ ] No `console.log` or debug code remains in production files.
- [ ] The branch is up-to-date with the `main` branch.

## Screenshots / Demos (if applicable)

<!-- Add screenshots, GIFs, or video recordings of the visual UI changes to help reviewers. -->
