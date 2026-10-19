# Route-level code splitting and prefetching

Issue: #1337

## How it works

- **Lazy routes.** Every route in `src/routes.tsx` is declared with `lazyRoute()`, which wraps
  `React.lazy` around a shared loader from `src/helpers/routePrefetch.ts`. Each page, including
  the admin dashboard, ships in its own chunk and is only downloaded when it is visited or
  prefetched.
- **Shared loader.** `createRouteLoader()` caches the dynamic-import promise, so a chunk that
  was prefetched on hover is reused when the user navigates. It never downloads twice and skips
  the Suspense fallback. A failed load is evicted so it can be retried.
- **Prefetch on intent.** `PrefetchLink` (`src/components/shared/PrefetchLink.tsx`) is a
  drop-in for `react-router`'s `Link`. It calls `prefetchRoute()` on `mouseenter`, `focus` and
  `touchstart`. It is wired into the core funnel: the header navigation (profile, dashboard,
  leaderboard, and so on) and every creator link on the leaderboard (`/@:username` → tip page).
- **Network-aware.** `canPrefetch()` returns `false` when `navigator.connection.saveData` is set
  or `effectiveType` is `slow-2g`/`2g`. On those connections the page is still loaded on
  navigation but never ahead of time.
- **Admin is not prefetchable.** `/admin`, `/health` and the embed widget register no prefetch
  patterns, so first-time visitors never download them speculatively.
- **Route-shaped fallbacks.** `wrap()`/`protect()` take a skeleton that `PageLoader` renders
  instead of the generic spinner. The skeletons live in
  `src/components/shared/RouteSkeletons.tsx`:

  | Route(s) | Fallback |
  | --- | --- |
  | `/@:username` | `TipPageSkeleton` (the page's own skeleton) |
  | `/profile` | `ProfileRouteSkeleton` (built on `ProfileViewSkeleton`) |
  | `/dashboard`, `/admin` | `DashboardRouteSkeleton` |
  | `/leaderboard`, `/transactions`, `/subscriptions`, `/health` | `ListRouteSkeleton` |
  | `/register`, `/profile/edit`, `/settings`, `/embed/generate`, `/receipt` | `FormRouteSkeleton` |
  | `/`, `/help`, `*` | `ContentRouteSkeleton` |
  | `/embed/@:username` | `EmbedRouteSkeleton` |

  `PageLoader`'s 10-second timeout and chunk-load-error recovery still apply.

## Measuring the initial bundle

```bash
cd frontend-scaffold
npm run analyze   # vite build + scripts/analyze-bundle.mjs
npm run size      # size-limit budgets
```

Compare the entry chunk (`assets/index-*.js`) and the list of chunks loaded on `/` in the
Network tab before and after this change. Page modules, such as `AdminDashboard-*.js`,
`DashboardPage-*.js` and `TipPage-*.js`, should appear as separate chunks that are not requested
on the landing page until you hover over a matching link.

See the PR description for the before/after numbers from the build.
