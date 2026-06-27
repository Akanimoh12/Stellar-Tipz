# Contributing to the Stellar Tipz backend

Thanks for helping build the Stellar Tipz backend! This document is the workflow
for the **`test-implement-drips`** branch.

## Workflow

1. **Find an issue.** Issues are labelled `backend` and grouped by area
   (`area:auth`, `area:tips`, `area:indexer`, …). Each issue is atomic.
2. **Comment to claim it** so two people don't pick the same task.
3. **Branch off `test-implement-drips`:**
   ```bash
   git checkout test-implement-drips
   git pull
   git checkout -b feat/<short-name>-<issue-number>
   ```
4. **Implement.** Follow the module conventions in the backend README.
5. **Verify locally:**
   ```bash
   cd backend
   npm run typecheck && npm run lint && npm run test
   ```
6. **Open a PR _against `test-implement-drips`_.** Reference the issue
   (`Closes #123`). Keep PRs small — one issue per PR.

## Definition of Done (applies to every issue)

- [ ] Code compiles (`npm run typecheck`) and lints clean (`npm run lint`).
- [ ] New logic has Vitest tests; `npm run test` passes.
- [ ] Request inputs are validated with Zod.
- [ ] Errors use `AppError` subclasses, never raw `res.status(...).send`.
- [ ] No secrets committed; new env vars added to `.env.example` **and** `src/config/env.ts`.
- [ ] Public functions have short doc comments.
- [ ] PR targets `test-implement-drips`.

## Notes

- **No GitHub Actions / CI on this branch yet** — run checks locally.
- Use the shared `logger` (`src/common/utils/logger.ts`), not `console.log`.
- Access the DB only through the Prisma singleton (`src/db/prisma.ts`).
- Read env only through `src/config/env.ts`.

## Test database helper

`tests/helpers/db.ts` exposes `resetDb()` which truncates all tables inside a
single transaction. Use it in integration tests to guarantee a clean state:

```ts
import { resetDb } from './helpers/db';

beforeEach(resetDb);

it('starts empty', async () => {
  const users = await prisma.user.findMany();
  expect(users).toHaveLength(0);
});
```

> **Note:** `resetDb` requires a running PostgreSQL instance (see `make -C backend db-up`).
> Unit tests that mock the Prisma client do not need it.
