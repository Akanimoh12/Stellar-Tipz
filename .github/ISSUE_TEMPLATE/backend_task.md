---
name: Backend Task
about: Backend API, indexer, jobs, or realtime work
title: "[BACKEND] "
labels: ["backend", "good first issue"]
assignees: ''
---

## Task Description

Clear description of the backend work and what problem it solves.

## Scope

**File(s) to modify**:
- `backend/src/...`
- `backend/prisma/...`

**Module(s)**:
- `indexer`
- `realtime`
- `jobs`
- `modules/...`

## Requirements

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Technical Details

Implementation guidance, constraints, and any API contract or data model notes.

## Tests Required

- [ ] Unit tests cover the changed behavior
- [ ] Integration or regression test added where appropriate
- [ ] Error conditions and retries are covered

## Acceptance Criteria

- [ ] All requirements are met
- [ ] Unit tests pass (`npm test`)
- [ ] Type-check passes (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] No regressions in backend behavior

## Resources

- [Backend README](../backend/README.md)
- [ADR Index](../docs/adr/README.md)
- [Architecture overview](../ARCHITECTURE.md)

## How to Contribute

1. Fork this repository
2. Create a branch: `feat/<issue-number>-<short-description>`
3. Implement the changes in the backend modules
4. Add or update tests
5. Ensure CI passes: `cd backend && npm run typecheck && npm run lint && npm test`
6. Submit a PR referencing this issue
