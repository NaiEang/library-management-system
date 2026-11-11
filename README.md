# LibraFlow

Library management system: a NestJS API (`src/`) on Postgres (Supabase) and Redis/BullMQ. Every request is traced (OpenTelemetry), logged (JSON lines with trace
ids) and measured (Prometheus), and every admin/librarian write lands in `activity_logs`.

## Run it locally

You need Postgres and Redis on their default ports: Homebrew services, or `docker compose up -d`.

```bash
cp .env.example .env     # local defaults; nothing here touches Supabase
# then set JWT_ACCESS_SECRET in .env (the app refuses the placeholder):
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm install
npm run seed:dev         # builds the schema in the LOCAL db and fills ~4 months of dummy data
npm run start:dev        # http://localhost:3000, Swagger at /api/docs
npm run simulate -- 300  # optional: 5 min of dummy traffic for traces and metrics (other terminal)
```

Every route needs a login unless it's marked `@Public()`. Log in with `POST /auth/login`
and send `Authorization: Bearer <accessToken>` (tokens last 15 minutes). After `seed:dev`,
the accounts are `admin@libraflow.local`, `librarian1..4@libraflow.local` and
`member1..3@libraflow.local`, all with the password `libraflow-dev-password` (set
`SEED_DEV_PASSWORD` to change it). On a real database, create the first admin with
`npm run seed:admin` instead.

`seed:dev` and the E2E setup refuse to run against anything but localhost or Docker, so a
Supabase `DATABASE_URL` is never reset.

Overdue reminders (BullMQ) and the queue dashboard at `/queues`: see
[docs/testing-overdue-notifications.md](docs/testing-overdue-notifications.md) for how to try them.

## Scripts

| Script | What it does |
|---|---|
| `npm run start:dev` | API in watch mode |
| `npm run seed:dev` | Rebuild the local schema from the entities and seed dummy data |
| `npm run simulate -- <seconds>` | Dummy traffic against the running API (after a build) |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E tests against a local `libraflow_test` database ([below](#tests)) |

## Dashboard, activity logs and roles

| Endpoint | Who | Notes |
|---|---|---|
| `GET /dashboard/stats` | admin, librarian | Stat cards, copies and loan items by status, 30-day loan trend, top books, category usage, recent activity |
| `GET /activity-logs` | admin, librarian | `page`, `limit` (≤100), `action`, `entityType`, `userId`, `role`, `from`, `to`, `search` |
| `GET /activity-logs/facets` | admin, librarian | Values and counts for the filter dropdowns |
| `GET /observability/{metrics,traces,logs}` | admin | Recent metrics, traces and logs as JSON |
| `GET /metrics`, `GET /health` | public | Prometheus scrape target and health check |

**Activity logs are automatic.** `ActivityLogInterceptor` records every successful
POST/PUT/PATCH/DELETE by an admin or librarian: action from the method (CREATE/UPDATE/DELETE),
entity from the controller path (`loans` → `Loan`), id from the result or `:id`, plus IP and a
readable description. Handlers can refine it:

```ts
@Patch(':id/approve')
@LogActivity({ action: 'APPROVE' })           // "librarian2 approved Loan #812 "LN-000812""
approve(...) {}

@Post('login')
@LogActivity({ skip: true })                   // then call activityLogsService.record(...) yourself
login(...) {}
```

**Roles.** The auth module (`src/auth`) registers a global JWT guard and a global
`RolesGuard`. `@Roles(RoleName.ADMIN, RoleName.LIBRARIAN)` restricts a route, `@Public()`
opens it to guests, and a route with neither accepts any logged-in user, members included.
`request.user` (and `@CurrentUser()`) is `{ id, username, role, memberId? }`, loaded from the
database on every request; it is undefined on `@Public()` routes.

## Observability

| Signal | Where | Later |
|---|---|---|
| Traces | OpenTelemetry: HTTP → `Controller.handler` → service spans → Postgres. The latest 500 are kept in memory for `GET /observability/traces` | Set `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` to send them to Jaeger or Tempo |
| Logs | JSON lines with `traceId`/`spanId` in `LOG_FILE`, plus `GET /observability/logs` | Ship the file with Promtail or Vector |
| Metrics | `/metrics`: RED per route, `libraflow_book_copies`, `libraflow_loan_items`, `libraflow_overdue_loan_items`, `libraflow_activity_logs_written_total` | `docker compose --profile observability up -d` (Prometheus :9090, Grafana :3001, Jaeger :16686) |

`src/common/observability/instrumentation.ts` must stay the first import in `main.ts`.

## Tests

`npm run test:e2e` rebuilds `libraflow_test` from the entities, loads small fixtures with known
numbers (`test/setup/fixtures.ts`), and boots the real `AppModule`. It expects
`postgres://libraflow:libraflow@localhost:5432/libraflow_test` (Docker creates it; with Homebrew run
`createdb -O libraflow libraflow_test`), or set `TEST_DATABASE_URL`. CI runs the same suite against a
Postgres service container.

## Docker

```bash
docker compose up -d                          # Postgres + Redis
docker compose --profile app up -d --build    # + the API image
docker compose --profile observability up -d  # + Jaeger, Prometheus, Grafana
```

## Database note

`src/database/migrations/1793626719884-InitialSchema.ts` only alters tables that already exist in
Supabase. It cannot build an empty database, and it drops the hand-written CHECK constraints and
indexes there. Local and test databases are therefore built with `synchronize` from the entities.
A baseline migration that creates the tables would let `migration:run` work everywhere.
