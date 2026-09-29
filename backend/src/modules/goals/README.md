# Goals Module

Creator funding goals with CRUD operations, progress tracking, and completion notifications.

## Overview

The Goals module allows creators to set funding targets and track progress toward those goals. When a goal is fully funded, the system automatically transitions it to COMPLETED status and creates a notification for the goal creator.

## Features

- **CRUD Operations**: Create, read, update, and delete funding goals
- **Progress Tracking**: Real-time progress calculation with percentage, completion status, and days remaining
- **Completion Detection**: Automatic detection when a goal reaches its target
- **Notifications**: Automatic notification creation when a goal is completed
- **Ownership Enforcement**: Users can only modify/delete their own goals

## API Endpoints

All endpoints require authentication via Bearer token.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/goals` | Create a new funding goal |
| GET | `/goals` | List goals for a user (paginated) |
| GET | `/goals/:goalId` | Get a specific goal by ID |
| PATCH | `/goals/:goalId` | Update a goal (owner only) |
| DELETE | `/goals/:goalId` | Delete a goal (owner only) |
| GET | `/goals/:goalId/progress` | Get goal with computed progress fields |

## Request/Response Examples

### Create Goal

```http
POST /api/v1/goals
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "New streaming setup",
  "targetStroops": "10000000",
  "deadline": "2026-12-31T23:59:59Z"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "goal_abc123",
    "userId": "user_xyz789",
    "title": "New streaming setup",
    "targetStroops": "10000000",
    "raisedStroops": "0",
    "deadline": "2026-12-31T23:59:59Z",
    "status": "ACTIVE",
    "createdAt": "2026-01-15T10:30:00Z",
    "updatedAt": "2026-01-15T10:30:00Z"
  }
}
```

### Get Goal Progress

```http
GET /api/v1/goals/goal_abc123/progress
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": {
    "id": "goal_abc123",
    "userId": "user_xyz789",
    "title": "New streaming setup",
    "targetStroops": "10000000",
    "raisedStroops": "5000000",
    "deadline": "2026-12-31T23:59:59Z",
    "status": "ACTIVE",
    "createdAt": "2026-01-15T10:30:00Z",
    "updatedAt": "2026-01-15T12:00:00Z",
    "raisedPercentage": 50,
    "isComplete": false,
    "daysRemaining": 350
  }
}
```

## Data Model

### Goal

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier (CUID) |
| userId | string | Owner's user ID |
| title | string | Goal title (1-200 chars) |
| targetStroops | string | Target amount in stroops (decimal string) |
| raisedStroops | string | Amount raised so far in stroops |
| deadline | string \| null | Optional ISO-8601 deadline |
| status | GoalStatus | ACTIVE, COMPLETED, CANCELLED, or EXPIRED |
| createdAt | string | Creation timestamp |
| updatedAt | string | Last update timestamp |

### GoalProgress

Extends Goal with computed fields:

| Field | Type | Description |
|-------|------|-------------|
| raisedPercentage | number | Percentage raised (0-100) |
| isComplete | boolean | True when raised >= target |
| daysRemaining | number \| null | Days until deadline (null if no deadline) |

## Business Rules

1. **Ownership**: Only the goal owner can update or delete their goals
2. **Status Transitions**: Goals can be transitioned between ACTIVE, COMPLETED, CANCELLED, and EXPIRED
3. **Completion Detection**: When `raisedStroops >= targetStroops` and status is ACTIVE, the goal automatically transitions to COMPLETED
4. **Notification**: A GOAL_COMPLETED notification is created when a goal is completed
5. **Deadline Handling**: If a deadline passes, the goal does not automatically expire (manual status change required)

## Testing

Run tests with:
```bash
npm test -- --run goals
```

All 23 tests cover:
- Progress calculation (pure function)
- CRUD operations (DB-backed with mocks)
- Completion detection and notification
- Edge cases (not found, ownership validation)

## Architecture

```
goals/
├── goals.types.ts      # TypeScript interfaces
├── goals.schema.ts     # Zod validation schemas
├── goals.service.ts    # Business logic and DB operations
├── goals.controller.ts # Express request handlers
├── goals.routes.ts     # Route definitions with auth middleware
├── goals.openapi.ts    # OpenAPI documentation
├── goals.test.ts       # Unit tests
└── README.md           # This file
```
