# Goals Module — Design Document

## Purpose

Enable creators to set funding targets, track progress toward those goals, and receive automatic notifications when goals are fully funded.

## Architecture

### Layer Separation

```
┌─────────────────────────────────────────────────────────┐
│  Routes (goals.routes.ts)                               │
│  • HTTP method + path mapping                           │
│  • Auth middleware (requireAuth)                         │
├─────────────────────────────────────────────────────────┤
│  Controller (goals.controller.ts)                       │
│  • Request parsing and validation (Zod)                 │
│  • Ownership verification                               │
│  • Response formatting                                  │
├─────────────────────────────────────────────────────────┤
│  Service (goals.service.ts)                             │
│  • Business logic (progress, completion)                │
│  • Database operations (Prisma)                         │
│  • Notification creation                                │
├─────────────────────────────────────────────────────────┤
│  Database (Prisma/PostgreSQL)                           │
│  • Goal, Notification models                            │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Pure Progress Calculation**: `calculateProgress()` is a pure function with no I/O, making it easily testable and deterministic.

2. **Atomic Completion**: Goal status update and notification creation happen in a single `Promise.all()` transaction to ensure consistency.

3. **Ownership at Controller Level**: Ownership checks happen in the controller (before service calls) to keep service functions reusable for internal/system operations.

4. **BigInt String Serialization**: Stellar stroops use BigInt for precision, but the API serializes them as decimal strings for JSON compatibility.

## Data Flow

### Goal Creation
```
Client → POST /goals → Controller validates → Service creates → Prisma → Response
```

### Progress Check
```
Client → GET /goals/:id/progress → Controller validates → Service fetches + calculates → Response
```

### Completion Detection
```
Payment webhook → Service updates raisedStroops → checkAndNotifyCompletion()
  → If raised >= target: Transition to COMPLETED + Create notification
```

## Error Handling

- **NotFoundError** (404): Goal not found
- **BadRequestError** (400): Validation errors, ownership violations
- **ZodError** → Converted to BadRequestError with issue details

All errors propagate through Express error handler middleware.

## Security Considerations

1. **Authentication**: All endpoints require valid JWT via `requireAuth` middleware
2. **Ownership Enforcement**: Update/delete operations verify `goal.userId === auth.userId`
3. **Input Validation**: All inputs validated with Zod schemas before processing
4. **No SQL Injection**: Prisma ORM uses parameterized queries

## Performance

- **Pagination**: List endpoint supports page/limit with database-level skip/take
- **No N+1 Queries**: Single queries for list operations with count
- **Index Usage**: Prisma indexes on `userId` and `id` for fast lookups

## Testing Strategy

- **Unit Tests**: Pure functions tested without mocks
- **Integration Tests**: DB operations tested with Vitest mocks
- **Coverage**: 23 tests covering happy paths, edge cases, and error scenarios

## Future Considerations

1. **Goal Expiration**: Could add scheduled job to auto-expire past-deadline goals
2. **Progress Events**: Could emit events for real-time UI updates via WebSocket
3. **Goal Templates**: Could support reusable goal templates for common use cases
4. **Multi-currency**: Could extend to support multiple currency types beyond stroops
