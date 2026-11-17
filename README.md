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
npm run start:dev        # API at http://localhost:3000/api/v1, Swagger at /api/docs
npm run simulate -- 300  # optional: 5 min of dummy traffic for traces and metrics (other terminal)
```

Every API route is under `/api/v1` (e.g. `/api/v1/auth/login`); only `/health`, `/metrics`,
`/observability/*`, `/queues` and the Swagger UI at `/api/docs` stay at the root.
Every route needs a login unless it's marked `@Public()`. Log in with `POST /api/v1/auth/login`
and send `Authorization: Bearer <accessToken>` (tokens last 15 minutes). After `seed:dev`,
the accounts are `admin@libraflow.local`, `manager1@libraflow.local`, `librarian1..4@libraflow.local` and
`member1..3@libraflow.local`, all with the password `libraflow-dev-password` (set
`SEED_DEV_PASSWORD` to change it). On a real database, create the first admin with
`npm run seed:admin` instead.

`seed:dev` and the E2E setup refuse to run against anything but localhost or Docker, so a
Supabase `DATABASE_URL` is never reset.

For a full list of endpoints with sample `curl` commands and responses, see
[docs/api-reference.md](docs/api-reference.md).

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

## Roles and activity logs

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
Staff roles form a ladder, admin > manager > librarian: a route for `RoleName.LIBRARIAN`
also lets managers and admins in, and one for `RoleName.MANAGER` lets admins in. Members
stand apart.
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
`postgres://libraflow:libraflow@localhost:5432/libraflow_test` (created on the first run if it is
missing), or set `TEST_DATABASE_URL`. CI runs the same suite against a Postgres service container.

## Docker

```bash
docker compose up -d                          # Postgres + Redis
docker compose --profile app up -d --build    # + the API image
docker compose --profile observability up -d  # + Jaeger, Prometheus, Grafana
```

### Run it from a clean clone

You need Docker (with Compose) and Node.js 24 (only to seed the database).

```bash
git clone https://github.com/NaiEang/library-management-system.git
cd library-management-system
cp .env.example .env
```

In `.env`, replace `JWT_ACCESS_SECRET` with a random secret (the app refuses the placeholder):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then start the database, seed it, and start the API:

```bash
docker compose up -d                          # 1. Postgres + Redis
npm ci                                        # 2. tools for the seed script
npm run seed:dev                              # 3. build the schema and fill dummy data
docker compose --profile app up -d --build    # 4. build and start the API
docker compose --profile app ps               # all three should be "healthy"
curl http://localhost:3000/health
```

Seed first: the API expects the tables to exist. The seed runs from your machine (its
dummy-data library isn't in the production image) and writes to the Postgres container
through port 5432. Swagger is at `http://localhost:3000/api/docs`; log in with the seeded
accounts listed in [Run it locally](#run-it-locally).

Inside Docker the API runs with `NODE_ENV=production`, so email verification codes are only
sent if `SMTP_*` is set in `.env`. For a demo without an email server, add
`NODE_ENV=development` to `.env`: codes then appear in `docker logs libraflow-api`.

### Roll back to an earlier image

Every push to `main` that passes CI publishes the API image to GitHub Container Registry,
tagged with its commit SHA: `ghcr.io/naieang/libraflow-api:<sha>` (plus `latest`). Find the
SHA of a version that worked under the repository's **Packages** or **Actions** page, then:

```bash
API_IMAGE=ghcr.io/naieang/libraflow-api:<sha> docker compose --profile app up -d --no-build api
```

Compose pulls that image and replaces the running API; the database and its data stay as
they are. To go back to building the current code:

```bash
docker compose --profile app up -d --build api
```

If the package is private, log in first with `docker login ghcr.io` (a GitHub token with
`read:packages`). Roll back only across versions with the same database schema: an older
image can't use tables or columns added after it.

Seed the catalog (books and copies)

npm run seed:dev fills a local database with dummy data. To fill the shared Supabase database with the demo catalog instead (51 books with authors, categories and about 140 physical copies), run the catalog seed:

bash
npm run migration:run     # the schema must be current first (books.item_type, etc.)
npm run seed:catalog      # writes to the database in DATABASE_URL

What it creates:

8 categories, 16 authors and 51 items: books, limited_edition books and research_paper items (books.item_type).
2 to 4 copies per item with barcodes like LIB-000123, mixed conditions, shelf locations, and a few damaged or lost copies for demos. Every item keeps at least one available copy. No copy is seeded as borrowed: that status belongs to the loans flow.

It is safe to run again: it reuses existing rows by title, name and ISBN, tops copies up to the target count, and never touches a copy that has loan history. It does write to whatever DATABASE_URL points at, so tell the team before running it against the shared database.

Roll back a migration

Schema changes go through migrations (npm run migration:generate, then npm run migration:run). To undo the most recent migration:

bash
# 1. See what is applied, newest first (Supabase SQL editor or psql)
#    SELECT id, name FROM migrations ORDER BY id DESC LIMIT 5;

# 2. Undo the newest one: runs its down() and removes its row from "migrations"
npm run migration:revert

# 3. Repeat step 2 to go back one more migration, one at a time

Before you run it:

Know what down() destroys. Reverting a migration that added a column or table drops it and its data (for example, reverting AddBookItemType removes books.item_type). Read the migration's down() first.
Never revert on the shared Supabase database without telling the team. Everyone uses the same schema; one revert changes it for all of you and for the deployed app. Take a backup first (Supabase dashboard, Database, Backups).
Keep the code and the database in step. After a revert, also revert the matching entity and migration commit (git revert <sha>). If an entity still lists a column the database no longer has, requests fail with column ... does not exist.
Check the result: run the SELECT above again, then start the API and open /api/docs.

Local and test databases are rebuilt from the entities, so they never need a revert: drop them (or docker compose down -v) and run npm run seed:dev again.

To roll back the deployed image instead of the schema, see Roll back to an earlier image.

## Database note

`src/database/migrations/1793626719884-InitialSchema.ts` only alters tables that already exist in
Supabase. It cannot build an empty database, and it drops the hand-written CHECK constraints and
indexes there. Local and test databases are therefore built with `synchronize` from the entities.
A baseline migration that creates the tables would let `migration:run` work everywhere.
