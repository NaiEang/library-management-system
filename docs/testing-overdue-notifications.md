# Testing overdue notifications

## How it works

1. **Every day at 08:00** a scan finds loan items that are past their due date and not
   returned, and marks them `overdue`. It also finds borrowed books **due today** and
   **due tomorrow** (library calendar, `LIBRARY_TIME_ZONE`).
2. For each of those it puts **one job on a BullMQ queue** (stored in Redis).
3. A **worker** picks up each job, saves an in-app notification for the student
   (`LOAN_DUE_SOON`, `LOAN_DUE_TODAY` or `LOAN_OVERDUE`), for example:
   *Your book "&lt;title&gt;" is overdue. You are blocked until you return it.*
   It emails it if `SMTP_HOST` is set (otherwise it only writes it to the log), and
   also sends it on **Telegram** if `TELEGRAM_BOT_TOKEN` is set and the student linked
   their Telegram (see below).
4. While a student has an overdue book, **they can't borrow** anything else.

You don't have to wait for 08:00: staff can run the same scan any time with
`POST /notifications/overdue/scan`. Everything below runs on a **local** database.

## Setup

```bash
git checkout impl-overdue-notification
npm install
docker compose up -d     # Postgres + Redis
cp .env.example .env     # then set JWT_ACCESS_SECRET (see README)
npm run seed:dev         # local demo data, includes overdue books
npm run start:dev
```

Want a fast yes/no first? This runs the whole flow automatically:

```bash
npm run test:e2e -- test/overdue-notifications.e2e-spec.ts test/loans-access.e2e-spec.ts
```

## Test it by hand

**1. Log in as staff.** Open http://localhost:3000/api/docs, call `POST /auth/login` with
`admin@libraflow.local` / `libraflow-dev-password`, then click **Authorize** and paste the
`accessToken`.

**2. Run the scan.** Call `POST /notifications/overdue/scan`.
You get `{ "marked": n, "queued": n, "overdue": n, "dueToday": n, "dueTomorrow": n }`:
`marked` is how many books just became overdue, `queued` is how many reminders were put on
the queue (the last three counts together).

**3. Watch the queue.** Open http://localhost:3000/queues (login `admin` / `1234`).
The jobs should be in **completed**; open one and you'll see `sent: true`.
Run the scan again: no new jobs appear, because each book gets one reminder per day.

**4. Check the student got it.** The reminders are saved in the database:

```bash
docker exec libraflow-postgres psql -U libraflow -d libraflow_dev -c "SELECT user_id, message, created_at FROM notifications WHERE type='LOAN_OVERDUE' ORDER BY created_at DESC LIMIT 5;"
```

The newest rows should be from just now, with the overdue message.

**5. Check the borrowing block.** Log in as a member (`member1..3@libraflow.local`, same
password) who has an overdue book and call `POST /loans/request` with
`{ "bookCopyIds": ["2"] }`. You should get `400 Account blocked: You have overdue books.`
A member without overdue books gets the loan instead.
Members also get `403` if they try `PATCH /loans/{id}/approve`, which is staff only.

## Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) and set `TELEGRAM_BOT_TOKEN` in `.env`.
2. As a member, call `POST /notifications/telegram/link`. You get `{ "url": "https://t.me/<bot>?start=..." }`.
3. Open the url and press **Start**. The bot replies *Linked!* and
   `GET /notifications/telegram` now returns `{ "linked": true }`.
4. Run the scan (step 2 above): the reminders arrive in Telegram as well as by email.

The link works once and expires after 15 minutes. `DELETE /notifications/telegram`, or `/stop`
in the bot, unlinks; blocking the bot unlinks too. Run the bot's polling on one instance only
(`TELEGRAM_POLLING=off` on the others).

## Notes

- Settings (`OVERDUE_SCAN_CRON`, `QUEUE_DASHBOARD_*`, `SMTP_*`, `TELEGRAM_*`) are explained in `.env.example`.
- `/queues` says Not Found: the dashboard password is empty, or restart `start:dev` after editing `.env`.
- Not done yet: an endpoint to list notifications, and fines on late return.
