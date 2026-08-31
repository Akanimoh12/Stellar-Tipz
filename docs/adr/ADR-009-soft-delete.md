# ADR-009: Soft-delete convention

## Status

Accepted

## Decision

The following models are soft-deleted with a nullable `deletedAt` timestamp:

- `User`
- `ApiKey`
- `Notification`
- `Goal`
- `Subscription`
- `WebhookSubscription`

Normal Prisma reads against these models exclude rows where `deletedAt` is not
null. This is enforced by the middleware registered on the shared `prisma`
client in `backend/src/db/prisma.ts`. Queries that must inspect deleted rows,
such as admin, audit, privacy recovery, or reactivation workflows, use the
explicit `prismaIncludingDeleted` client.

The following models are not soft-deleted:

- On-chain and append-only records (`Tip`, `Refund`, `EventLog`, `AuditLog`)
- Derived/cache records (`CreditScore`, `CreditScoreHistory`, `AnalyticsDaily`,
  `LeaderboardSnapshot`, `Streak`)
- Short-lived or revocable credentials (`AuthChallenge`, `RefreshToken`)
- Operational records without a deletion lifecycle (`Withdrawal`,
  `NotificationPreference`, `PayoutSchedule`, `WebhookDelivery`,
  `DeadLetterJob`, `XAccount`)

These records are hard-deleted or expired only by their owning workflow, and
their historical/audit value must not be removed as part of account deletion.

## Username uniqueness

Usernames remain reserved after a user is soft-deleted. `User.username` keeps a
database-level `@unique` constraint, and availability checks only consider
active users. This prevents a deleted identity from being reassigned to a new
account and avoids ambiguity when a deleted user is reactivated.

## Limitations

The middleware applies only to Prisma queries made through the shared
`prisma` client. Raw SQL bypasses it and must explicitly include the relevant
`"deletedAt" IS NULL` predicate; the current raw creator search does so. New
raw SQL must be reviewed with this convention in mind.