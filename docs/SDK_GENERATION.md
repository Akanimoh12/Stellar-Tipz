# SDK Generation for Stellar Tipz API

> Generate typed TypeScript clients from the OpenAPI spec to keep frontend and backend in sync.

---

## Overview

The Stellar Tipz API publishes an OpenAPI 3.0 specification at `/api/v1/docs/openapi.json`. A TypeScript SDK is auto-generated from this spec and committed to the repository. This eliminates hand-written API client drift — if the backend changes, the TypeScript types automatically update.

**Problem solved:**
- ❌ Before: Frontend hand-writes fetch calls → drifts from API spec
- ✅ After: SDK auto-generated from spec → always in sync

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Backend (Express)                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ Feature modules call mergeOpenApiPaths()    │   │
│  │ to register their routes → openApiDocument  │   │
│  └─────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────┘
                           │ GET /api/v1/docs/openapi.json
                           ▼
┌─────────────────────────────────────────────────────┐
│  OpenAPI Spec (openapi-generated.json)              │
│  ┌─────────────────────────────────────────────┐   │
│  │ 50+ documented routes                       │   │
│  │ Request/response schemas                    │   │
│  │ Security definitions                        │   │
│  └─────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────┘
                           │ OpenAPI Generator CLI
                           ▼
┌─────────────────────────────────────────────────────┐
│  Generated SDK (sdk/stellar-tipz-sdk/)              │
│  ┌─────────────────────────────────────────────┐   │
│  │ TypeScript classes for each resource        │   │
│  │ Automatic type inference from spec          │   │
│  │ Axios HTTP client (configurable)            │   │
│  └─────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────┘
                           │ npm install
                           ▼
┌─────────────────────────────────────────────────────┐
│  Frontend (React)                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ import { ProfilesApi, TipsApi } from SDK   │   │
│  │ const profiles = await api.profiles.get()   │   │
│  │ Fully typed, IDE autocomplete               │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Workflow

### 1. Backend Developer: Add a New Route

```typescript
// backend/src/modules/goals/goals.openapi.ts
export function registerGoalsDocs(): void {
  mergeOpenApiPaths({
    [`${basePath}`]: {
      post: {
        tags: ['Goals'],
        summary: 'Create a goal',
        requestBody: { /* ... */ },
        responses: { /* ... */ },
      },
    },
  });
}
```

The spec is immediately available at `/api/v1/docs/openapi.json`.

### 2. Regenerate the SDK

Run the generation script locally:

```bash
./scripts/generate-sdk.sh
```

This:
1. Fetches the latest OpenAPI spec from the running backend
2. Generates TypeScript types and API classes
3. Builds the SDK
4. Saves to `sdk/stellar-tipz-sdk/`

### 3. Frontend Developer: Use the New Types

```typescript
import { GoalsApi } from '@stellar-tipz/sdk';

const goalsApi = new GoalsApi(config);
const goal = await goalsApi.createGoal({
  title: 'New setup',
  targetStroops: '10000000',
  // IDE autocomplete helps here ↓
});
```

### 4. CI Verification

On every PR:
```bash
./scripts/verify-sdk-up-to-date.sh
```

Fails if:
- OpenAPI spec has changed since last generation
- Generated SDK files are missing or stale

Developer must regenerate locally and commit.

---

## Commands

### Generate SDK

```bash
./scripts/generate-sdk.sh
```

**What it does:**
1. Starts the backend dev server
2. Fetches OpenAPI spec from `/api/v1/docs/openapi.json`
3. Generates TypeScript client using @openapitools/openapi-generator-cli
4. Builds the generated SDK
5. Writes `backend/openapi-generated.json` and `sdk/stellar-tipz-sdk/`

**Requirements:**
- Node.js and npm
- `npm run dev` must work in `backend/`

**Output:**
- `backend/openapi-generated.json` — committed OpenAPI spec (source of truth)
- `sdk/stellar-tipz-sdk/` — generated SDK code (committed)

---

### Verify SDK is Up-to-Date

```bash
./scripts/verify-sdk-up-to-date.sh
```

**Used in:**
- CI before merging PRs
- Local pre-commit hooks (optional)

**Fails if:**
- Backend routes have changed since last generation
- SDK files are missing or outdated

**Fix:**
```bash
./scripts/generate-sdk.sh
git add backend/openapi-generated.json sdk/stellar-tipz-sdk/
git commit -m "chore: update SDK from latest OpenAPI spec"
git push
```

---

### Generate OpenAPI Spec Only

```bash
npx tsx backend/scripts/generate-openapi-spec.ts [output-path]
```

Generates `backend/openapi-generated.json` without running the full generator. Useful for:
- CI verification
- Inspecting the spec without regenerating code
- Debugging spec issues

---

## Frontend Integration

The frontend consumes the SDK via `frontend-scaffold/src/services/api/sdk-client.ts`:

```typescript
import { getSdkClient, withSdkError } from '@/services/api/sdk-client';

// Get a typed API instance
const client = getSdkClient();

// Make a request with automatic error handling
const profiles = await withSdkError(
  () => client.profiles.getProfileByUsername('alice'),
  'Failed to fetch profile'
);
```

### Key Features

- ✅ Automatic JWT token attachment (via `getValidAccessToken()`)
- ✅ 401 handling with token refresh
- ✅ Request tracing with `x-request-id`
- ✅ Sentry error logging
- ✅ Type-safe API calls with IDE autocomplete

### Migration from Hand-Written Client

**Before:**
```typescript
const res = await apiFetch('/profiles/by-username/alice');
const profile = res as Profile; // No type checking!
```

**After:**
```typescript
const profile = await getSdkClient().profiles.getProfileByUsername('alice');
// Fully typed, IDE knows the shape of profile
```

---

## Publishing the SDK

The generated SDK can be published to npm for third-party integrators:

```bash
cd sdk/stellar-tipz-sdk
npm publish --access public
```

Or publish only to a private registry:

```bash
npm publish --registry https://your-private-registry.com
```

**Package details:**
- Name: `@stellar-tipz/sdk`
- Version: Tracks backend version (e.g., `1.0.0`)
- Auto-generated with TypeScript + Axios

---

## Troubleshooting

### Error: "Backend server did not start"

**Symptom:**
```
✗ Server did not start within timeout
```

**Fixes:**
1. Ensure backend dependencies are installed: `cd backend && npm install`
2. Check that port 3001 is available
3. Try manually: `npm run dev` in `backend/` directory

### Error: "OpenAPI spec is out of date"

**Symptom:**
```
✗ FAIL: OpenAPI spec is out of date
```

**Fixes:**
```bash
./scripts/generate-sdk.sh
git add backend/openapi-generated.json sdk/stellar-tipz-sdk/
git commit -m "chore: update SDK"
```

### Generated SDK missing exports

**Symptom:**
```
Cannot find module '@stellar-tipz/sdk'
```

**Fixes:**
1. Ensure SDK was built: `cd sdk/stellar-tipz-sdk && npm run build`
2. Check `sdk/stellar-tipz-sdk/dist/index.js` exists
3. Verify `sdk/stellar-tipz-sdk/package.json` has correct `main` entry

### Spec has 0 routes

**Symptom:**
```
Spec generated with 0 routes
```

**Fixes:**
1. Check backend server is actually running: `curl http://localhost:3001/health`
2. Verify OpenAPI endpoint: `curl http://localhost:3001/api/v1/docs/openapi.json`
3. Check feature modules are calling `registerAuthDocs()`, `registerGoalsDocs()`, etc.

---

## FAQ

**Q: Do I need to commit the generated SDK to the repo?**

Yes. This ensures:
- Every commit has a snapshot of the spec
- Types are available offline
- CI can verify spec hasn't drifted
- Third-party integrators can review diffs

**Q: Can I manually edit the generated SDK?**

No. Any manual edits will be overwritten on the next generation. Instead:
1. Fix the backend route or spec
2. Run `./scripts/generate-sdk.sh`
3. Commit the updated SDK

**Q: What if I'm using a different HTTP client (React Query, etc.)?**

The generated SDK uses Axios by default. You can:
1. Swap the HTTP adapter by extending the configuration
2. Extract just the types from the SDK: `import type { Profile, Tip } from '@stellar-tipz/sdk'`
3. Use those types with your own fetch logic

**Q: Does the frontend automatically update when the backend changes?**

Only after:
1. Backend code is merged and deployed
2. You run `./scripts/generate-sdk.sh`
3. You commit the updated SDK
4. Frontend is redeployed

For faster iteration during development, keep the frontend dev server running — it will pick up frontend code changes immediately, then use the latest SDK when deployed.

---

## See Also

- [OpenAPI Spec](/api/v1/docs) — Live API documentation
- [Backend API Routes](../backend/src/api/v1.routes.ts) — All mounted routers
- [OpenAPI Configuration](../sdk/openapi-generator-config.json) — Generator settings
- [Frontend SDK Client](../frontend-scaffold/src/services/api/sdk-client.ts) — Frontend integration
