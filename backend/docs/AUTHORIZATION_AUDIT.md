# Authorization audit

Issue #1231 reviewed every backend route that accepts a resource identifier or a user-controlled owner identifier.

## Findings and resolutions

| Resource | Endpoint surface | Result |
| --- | --- | --- |
| Goals | `PATCH`/`DELETE /goals/:id` | Already checked ownership; checks now use the shared `assertOwnership` helper. Public `GET` routes remain intentional because goals are discovery content. |
| Notifications | `GET`/`PATCH` `/notifications/:id` | Already queried by both notification id and authenticated user id. |
| Webhook subscriptions | `DELETE /webhooks/subscriptions/:id` | Already checked ownership; now uses the shared helper. |
| Webhook deliveries | `GET /webhooks/deliveries` and `GET /webhooks/deliveries/:id` | Fixed: delivery queries are scoped through the owning subscription. Cross-user access returns 403/404. |
| Credit scores | `POST /credit/recalculate` | Fixed: endpoint now requires authentication and only accepts the authenticated user's id. |
| Profiles, tips, leaderboard, and credit history | Public identifier-based reads | Reviewed as public discovery/analytics data, not user-private resources. Tip receipts separately restrict access to sender or recipient. |
| Withdrawals, refunds, subscriptions, streaks, privacy, and payout schedule | `/me` authenticated surfaces | Reviewed: handlers derive the user id from the authenticated request rather than a route/body owner id. |

## Reusable check

`src/common/utils/ownership.ts` provides `assertOwnership(ownerId, actorId)`. It raises `ForbiddenError` on mismatches and is used by owner-scoped mutations and delivery access checks.
