# LibraFlow — Library Management System API

The backend API for LibraFlow, a library management system. It's built with [NestJS](https://nestjs.com), TypeORM, PostgreSQL (Supabase), and BullMQ on Redis.

## Features

- **Users & roles**: staff accounts and role management
- **Members**: library member records
- **Books**: books, authors, categories, and individual book copies
- **Loans**: loan requests, approval, and returns (request → approve → return)
- **Payments**: fines and payment records
- **Notifications**: member notifications
- **Dashboard**: activity logs and overview data
- **Swagger docs** at `/api/docs`

## Tech stack

| Layer      | Technology                         |
| ---------- | ---------------------------------- |
| Framework  | NestJS 12, TypeScript              |
| Database   | PostgreSQL (Supabase) via TypeORM  |
| Queue      | BullMQ + Redis                     |
| Validation | class-validator, class-transformer |
| Docs       | @nestjs/swagger                    |
| Testing    | Vitest, Supertest                  |
| Lint       | oxlint, Prettier                   |

## Project structure

```
src/
├── auth/            # Authentication
├── users/           # Users & roles
├── members/         # Library members
├── books/           # Books, authors, categories, copies
├── loans/           # Loans & loan items
├── payments/        # Payments / fines
├── notifications/   # Notifications
├── dashboard/       # Activity logs & dashboard
├── common/          # Shared utilities
├── database/
│   ├── data-source.ts   # TypeORM CLI data source
│   └── migrations/      # Database migrations
├── app.module.ts
└── main.ts
```

## Environment variables

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

| Variable                 | Description                                   | Example                  |
| ------------------------ | --------------------------------------------- | ------------------------ |
| `PORT`                   | HTTP port the API listens on                  | `3000`                   |
| `DATABASE_URL`           | PostgreSQL (Supabase) connection string       | `postgresql://...`       |
| `JWT_SECRET`             | Secret used to sign JWTs                      | `change-me`              |
| `SHARED_SERVICE_API_KEY` | API key for service-to-service calls (`x-api-key` header) | `change-me` |
| `REDIS_HOST`             | Redis host for BullMQ                         | `localhost`              |
| `REDIS_PORT`             | Redis port                                    | `6379`                   |

The database connects with SSL enabled, as Supabase requires.

## Running with Docker (recommended)

You need Docker with Compose v2.

```bash
cp .env.example .env      # then set DATABASE_URL and the secrets
docker compose up -d --build
```

This starts two services:

- **app**: the NestJS API at http://localhost:3000
- **redis**: Redis 7 at `localhost:6379`, with data stored in the `redis_data` volume

Inside the compose network, `REDIS_HOST` is set to `redis` automatically, so you don't need to change it in `.env`.

Useful commands:

```bash
docker compose logs -f app     # follow API logs
docker compose ps              # service status
docker compose down            # stop everything
docker compose down -v         # stop and delete the Redis volume
```

Run migrations from your host machine. The runtime image doesn't include the TypeORM CLI.

```bash
npm run migration:run
```

## Running locally (without Docker for the app)

Requirements: Node.js 24+ and npm.

```bash
npm install
cp .env.example .env

# start only Redis in Docker
docker compose up -d redis

# apply database migrations
npm run migration:run

# start the API
npm run start:dev      # watch mode
npm run start          # normal
npm run build && npm run start:prod   # production build
```

## API documentation

Once the app is running, open **http://localhost:3000/api/docs** for Swagger UI. It supports both Bearer (JWT) and `x-api-key` authentication.

Main route groups:

| Route              | Description                                     |
| ------------------ | ----------------------------------------------- |
| `/auth`            | Authentication                                  |
| `/users`           | User CRUD                                       |
| `/members`         | Member CRUD                                     |
| `/books`           | Book CRUD                                       |
| `/loans`           | `POST /request`, `PATCH /:id/approve`, `PATCH /:id/return` |
| `/payments`        | Payment CRUD                                    |
| `/notifications`   | Notifications                                   |
| `/dashboard`       | Dashboard & activity logs                       |

## Database migrations

```bash
npm run migration:generate -- src/database/migrations/<MigrationName>
npm run migration:run
npm run migration:revert
```

`synchronize` is disabled, so every schema change needs a migration.

## Tests & linting

```bash
npm run test        # unit tests
npm run test:e2e    # e2e tests
npm run test:cov    # coverage
npm run lint        # oxlint
npm run format      # prettier
```
