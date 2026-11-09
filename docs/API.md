# TheTracker API

Base path `/api`. Bodies are JSON. Authenticated routes need `Authorization: Bearer <accessToken>`.
Errors look like `{ "error": "message" }`. Money is in integer cents. Days are `YYYY-MM-DD` in `APP_TIMEZONE`.

Records the phone can create offline accept a client-generated UUID as `id`. Sending the same `id` again returns the
original record, so retries are safe. `occurredAt` keeps the real time of an action that was sent late.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → tokens and profile. Locks for 15 minutes after 5 failures. |
| POST | `/auth/refresh` | `{ refreshToken }` → a new pair. Each refresh token works once. |
| POST | `/auth/logout` | `{ refreshToken }` |
| GET | `/auth/me` | Profile and field settings. |
| POST | `/auth/password` | `{ current, next }` → signs out other devices. |

## Customers

Agents see their own and unassigned customers, managers see their team's, and admins see everything.

| Method | Path | Notes |
|---|---|---|
| GET | `/customers` | `q, status, priority, agentId (or none), archived=1, page, limit`. `all=1` returns the full list for offline use. |
| POST | `/customers` | `name, lat, lng` required. |
| GET / PATCH | `/customers/:id` | Detail includes notes, visits, open tasks and totals. |
| PUT / DELETE | `/customers/:id/favorite` | |
| POST | `/customers/:id/notes` | `{ id?, body }` |
| POST | `/customers/:id/archive` | Manager. `{ archive: false }` restores. |
| POST | `/customers/bulk-assign` | Manager. `{ ids, agentId }` |
| GET | `/customers/export.csv` | Manager. |
| POST | `/customers/import` | Manager. `{ csv, agentId? }` → counts and row errors. |

## Visits

| Method | Path | Notes |
|---|---|---|
| GET | `/visits` | `agentId, customerId, review, status, date, page` |
| POST | `/visits/check-in` | `{ id?, customerId, lat, lng, accuracy?, overrideReason?, occurredAt? }`. Outside the geofence without a reason → 422 `OUTSIDE_GEOFENCE`. |
| POST | `/visits/:id/check-out` | `{ outcome, summary?, orderCents?, followUpAt?, followUpTaskId?, lat?, lng?, occurredAt? }` |
| POST | `/visits/:id/cancel` | |
| POST | `/visits/:id/review` | Manager. `{ decision: APPROVED or REJECTED, note? }` |

## Route plans

| Method | Path | Notes |
|---|---|---|
| GET | `/plans` | `agentId?, date?` |
| PUT | `/plans` | `{ agentId?, date, customerIds, optimize?, lat?, lng? }`. Replaces stops that have not been handled. |
| POST | `/plans/:id/optimize` | `{ lat?, lng? }` → plan and km before and after. |
| POST | `/plans/stops/:id/skip` | `{ reason }` |
| POST | `/plans/stops/:id/restore` | |

## Tasks

`GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/complete`, `/reopen`, `/cancel`.

## Agent

| Method | Path | Notes |
|---|---|---|
| GET | `/agent/today` | Shift, open visit, plan, due tasks and stats. |
| POST | `/agent/shift/start`, `/agent/shift/end` | `{ lat?, lng?, occurredAt? }` |
| POST | `/agent/locations` | `{ battery?, points: [{ lat, lng, accuracy?, speed?, recordedAt }] }`. Ignored when off shift. |
| GET | `/agent/stats` | `days` from 7 to 90. |
| GET | `/agent/notifications` | |
| POST | `/agent/notifications/read` | `{ ids? }` |

## Manage (managers and admins)

`GET /manage/overview`, `/manage/live`, `/manage/agents/:id/day?date=`, `/manage/team`, `/manage/reports/agents?from=&to=`, `/manage/settings`, `/manage/audit` (admin).
`POST /manage/team`, `PATCH /manage/team/:id`, `POST /manage/team/:id/password`, `PUT /manage/settings` (admin).

## Live events (Socket.IO, console only)

Connect with `auth: { token }`. Events: `agent:location`, `visit:started`, `visit:completed`.
