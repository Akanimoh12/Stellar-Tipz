---
name: Frontend Task
about: Frontend UI, accessibility, or user-flow work
title: "[FRONTEND] "
labels: ["frontend", "good first issue"]
assignees: ''
---

## Task Description

Clear description of the frontend change and the user-facing problem it solves.

## Scope

**File(s) to modify**:
- `frontend-scaffold/src/...`

**Feature area**:
- Landing / profile / dashboard / tipping / leaderboard / shared components

## Requirements

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Technical Details

Implementation guidance, UX constraints, accessibility notes, and any relevant API or state considerations.

## Tests Required

- [ ] Component or page test added or updated
- [ ] Accessibility regression checked where relevant
- [ ] Browser / responsive behavior reviewed

## Acceptance Criteria

- [ ] All requirements are met
- [ ] Type-check passes (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] No accessibility regression for the touched flow

## Resources

- [Architecture overview](../ARCHITECTURE.md)
- [Frontend guide](../docs/FRONTEND_GUIDE.md)
- [ADR Index](../docs/adr/README.md)

## How to Contribute

1. Fork this repository
2. Create a branch: `feat/<issue-number>-<short-description>`
3. Implement the changes in the frontend
4. Add or update tests, especially accessibility and interaction coverage
5. Ensure CI passes: `cd frontend-scaffold && npm run typecheck && npm run lint && npm test`
6. Submit a PR referencing this issue
