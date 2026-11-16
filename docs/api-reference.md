# API Reference & Testing Guide

Base URL: `http://localhost:3000/api/v1`
Swagger UI: `http://localhost:3000/api/docs`

## Quick start

```bash
npm run seed:dev       # seed the database with test data
npm run start:dev      # start the API
```

## Test accounts

All accounts use the password `libraflow-dev-password`.

| Email | Role | Notes |
|---|---|---|
| `admin@libraflow.local` | admin | Full access |
| `manager1@libraflow.local` | manager | Can create librarians, manage accounts |
| `librarian1@libraflow.local` | librarian | Can approve/reject/return loans |
| `librarian2@libraflow.local` | librarian | |
| `member1@libraflow.local` | member | Can request loans, view own borrows |
| `member2@libraflow.local` | member | |
| `member3@libraflow.local` | member | |

---

## Auth

### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "librarian1@libraflow.local",
    "password": "libraflow-dev-password"
  }'
```

Response:

```json
{
  "accessToken": "eyJhbGciOiJIUz...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshToken": "abc123...",
  "refreshTokenExpiresAt": "2026-11-23T10:00:00.000Z",
  "user": {
    "id": "uuid",
    "email": "librarian1@libraflow.local",
    "username": "librarian1",
    "role": "librarian",
    "membershipStatus": null,
    "emailVerified": true
  }
}
```

> Save the `accessToken` — you'll need it for every request below.
> Tokens last **15 minutes**. Use the refresh endpoint to get a new one.

### Register (new member)

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newmember@example.com",
    "username": "newmember",
    "password": "securepassword123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

Response:

```json
{
  "id": "uuid",
  "email": "newmember@example.com",
  "username": "newmember",
  "role": "member",
  "membershipStatus": "pending_deposit",
  "emailVerified": false,
  "verificationCodeSent": false
}
```

### Refresh token

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<your-refresh-token>"
  }'
```

### Get current user

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

### Change password

```bash
curl -X PATCH http://localhost:3000/api/v1/auth/password \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "libraflow-dev-password",
    "newPassword": "newpassword123"
  }'
```

### Logout

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<your-refresh-token>"
  }'
```

---

## Books

### Create a book

```bash
curl -X POST http://localhost:3000/api/v1/books \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Clean Code",
    "isbn": "9780132350884",
    "publisher": "Prentice Hall",
    "publishedDate": "2008-08-01",
    "description": "A handbook of agile software craftsmanship",
    "language": "English",
    "itemType": "book",
    "authorIds": [1],
    "categoryId": 1
  }'
```

### List books (with search & pagination)

```bash
# Simple list
curl "http://localhost:3000/api/v1/books" \
  -H "Authorization: Bearer <accessToken>"

# Search with filters
curl "http://localhost:3000/api/v1/books?q=clean+code&limit=10" \
  -H "Authorization: Bearer <accessToken>"

# Filter by category
curl "http://localhost:3000/api/v1/books?categoryId=1&limit=20" \
  -H "Authorization: Bearer <accessToken>"

# Cursor pagination (use nextCursor from previous response)
curl "http://localhost:3000/api/v1/books?cursor=<nextCursor>" \
  -H "Authorization: Bearer <accessToken>"
```

### Get a single book

```bash
curl http://localhost:3000/api/v1/books/1 \
  -H "Authorization: Bearer <accessToken>"
```

### Update a book

```bash
curl -X PATCH http://localhost:3000/api/v1/books/1 \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Clean Code: Updated Edition"
  }'
```

### Delete a book

```bash
curl -X DELETE http://localhost:3000/api/v1/books/1 \
  -H "Authorization: Bearer <accessToken>"
```

---

## Book copies

### Create copies for a book

```bash
curl -X POST http://localhost:3000/api/v1/books/1/copies \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 3,
    "condition": "new",
    "location": "Shelf A-12"
  }'
```

### List copies of a book

```bash
# All copies
curl "http://localhost:3000/api/v1/books/1/copies" \
  -H "Authorization: Bearer <accessToken>"

# Filter by status
curl "http://localhost:3000/api/v1/books/1/copies?status=available" \
  -H "Authorization: Bearer <accessToken>"
```

### Find a copy by barcode

```bash
curl http://localhost:3000/api/v1/book-copies/by-code/CP-000001 \
  -H "Authorization: Bearer <accessToken>"
```

### Update a copy

```bash
curl -X PATCH http://localhost:3000/api/v1/book-copies/1 \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "condition": "good",
    "location": "Shelf B-03",
    "status": "available"
  }'
```

---

## Authors

### Create an author

```bash
curl -X POST http://localhost:3000/api/v1/authors \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Robert C. Martin"
  }'
```

### List authors

```bash
# All authors
curl http://localhost:3000/api/v1/authors \
  -H "Authorization: Bearer <accessToken>"

# Search
curl "http://localhost:3000/api/v1/authors?search=martin" \
  -H "Authorization: Bearer <accessToken>"
```

---

## Categories

### Create a category

```bash
curl -X POST http://localhost:3000/api/v1/categories \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Software Engineering",
    "description": "Books about software design and development"
  }'
```

### List all categories

```bash
curl http://localhost:3000/api/v1/categories \
  -H "Authorization: Bearer <accessToken>"
```

---

## Loans

### Request a loan (as member)

Login as a member first, then:

```bash
curl -X POST http://localhost:3000/api/v1/loans/request \
  -H "Authorization: Bearer <member-accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookCopyIds": ["<copy-id-1>", "<copy-id-2>"]
  }'
```

> **Validation rules:**
> - Member must have a minimum deposit of **$5**
> - Member must not be blocked (no active `blockedUntil` penalty)
> - Member must not have any overdue books
> - Each copy must have status `available` (borrowed/reserved copies are rejected)

As staff (librarian/admin) requesting on behalf of a member:

```bash
curl -X POST http://localhost:3000/api/v1/loans/request \
  -H "Authorization: Bearer <staff-accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "memberId": "<member-id>",
    "bookCopyIds": ["<copy-id>"]
  }'
```

Response:

```json
{
  "id": "uuid",
  "memberId": "uuid",
  "loanCode": "LN-1731765600000",
  "loanDate": "2026-11-16T15:00:00.000Z",
  "status": "pending",
  "createdAt": "2026-11-16T15:00:00.000Z"
}
```

### Approve a loan (librarian/admin)

```bash
curl -X PATCH http://localhost:3000/api/v1/loans/<loan-id>/approve \
  -H "Authorization: Bearer <staff-accessToken>"
```

> Sets loan to `active`, items to `borrowed`, copies to `borrowed`.
> Due date = 14 days from approval. Sends a notification to the member.

### Reject a loan (librarian/admin)

```bash
curl -X PATCH http://localhost:3000/api/v1/loans/<loan-id>/reject \
  -H "Authorization: Bearer <staff-accessToken>"
```

Response:

```json
{
  "id": "uuid",
  "memberId": "uuid",
  "loanCode": "LN-1731765600000",
  "status": "rejected",
  "items": [
    { "id": "uuid", "bookCopyId": "uuid" }
  ]
}
```

> Only pending loans can be rejected. Copies are released back to `available`.
> Sends a notification to the member.

### Return a loan (librarian/admin)

```bash
curl -X PATCH http://localhost:3000/api/v1/loans/<loan-id>/return \
  -H "Authorization: Bearer <staff-accessToken>"
```

Response (no overdue):

```json
{
  "id": "uuid",
  "memberId": "uuid",
  "loanCode": "LN-1731765600000",
  "status": "completed",
  "items": [
    {
      "id": "uuid",
      "bookCopyId": "uuid",
      "status": "returned",
      "returnedAt": "2026-11-16T15:00:00.000Z",
      "overdueDays": 0,
      "fineAmount": 0
    }
  ],
  "totalFine": 0,
  "blockedUntil": null
}
```

Response (with overdue fine):

```json
{
  "id": "uuid",
  "memberId": "uuid",
  "loanCode": "LN-1731765600000",
  "status": "completed",
  "items": [
    {
      "id": "uuid",
      "bookCopyId": "uuid",
      "status": "returned",
      "returnedAt": "2026-11-16T15:00:00.000Z",
      "overdueDays": 5,
      "fineAmount": 1.25
    }
  ],
  "totalFine": 1.25,
  "blockedUntil": "2026-11-26T15:00:00.000Z"
}
```

> **Fine rules:**
> - Fine = `ceil(overdueDays) x $0.25/day` per item
> - Fine is deducted from member's deposit (clamped at $0)
> - Member is blocked from borrowing for `2 x maxOverdueDays` days
> - Copies are released back to `available`

### Get loan detail (with live fines)

```bash
curl http://localhost:3000/api/v1/loans/<loan-id> \
  -H "Authorization: Bearer <accessToken>"
```

Response:

```json
{
  "id": "uuid",
  "memberId": "uuid",
  "loanCode": "LN-1731765600000",
  "loanDate": "2026-11-02T15:00:00.000Z",
  "status": "active",
  "items": [
    {
      "id": "uuid",
      "bookCopyId": "uuid",
      "status": "borrowed",
      "borrowedAt": "2026-11-02T15:00:00.000Z",
      "dueDate": "2026-11-16T15:00:00.000Z",
      "returnedAt": null,
      "overdueDays": 3,
      "fineAmount": 0.75
    }
  ],
  "totalFine": 0.75
}
```

> For unreturned items, `overdueDays` and `fineAmount` are calculated live (accruing).
> The fine is **not deducted** from the deposit until the loan is returned.

### List my loans (as member)

```bash
# All my loans
curl "http://localhost:3000/api/v1/loans/my" \
  -H "Authorization: Bearer <member-accessToken>"

# Filter by status
curl "http://localhost:3000/api/v1/loans/my?status=active&page=1&limit=10" \
  -H "Authorization: Bearer <member-accessToken>"
```

---

## Users & accounts (staff only)

### Create a librarian (manager/admin)

```bash
curl -X POST http://localhost:3000/api/v1/users/librarians \
  -H "Authorization: Bearer <manager-accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newlibrarian@libraflow.local",
    "username": "newlibrarian",
    "password": "securepassword123",
    "firstName": "Jane",
    "lastName": "Smith"
  }'
```

### Create a manager (admin only)

```bash
curl -X POST http://localhost:3000/api/v1/users/managers \
  -H "Authorization: Bearer <admin-accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newmanager@libraflow.local",
    "username": "newmanager",
    "password": "securepassword123",
    "firstName": "Bob",
    "lastName": "Jones"
  }'
```

### List members

```bash
# All members
curl "http://localhost:3000/api/v1/users/members" \
  -H "Authorization: Bearer <staff-accessToken>"

# Filter by status and search
curl "http://localhost:3000/api/v1/users/members?membershipStatus=active&search=member1&page=1&limit=20" \
  -H "Authorization: Bearer <staff-accessToken>"
```

### Verify a member's deposit

```bash
curl -X PATCH http://localhost:3000/api/v1/users/<user-id>/verify-deposit \
  -H "Authorization: Bearer <staff-accessToken>"
```

### Buy/renew gold membership

```bash
curl -X POST http://localhost:3000/api/v1/users/<user-id>/gold-membership \
  -H "Authorization: Bearer <staff-accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMethod": "cash"
  }'
```

### Enable/disable a user account

```bash
curl -X PATCH http://localhost:3000/api/v1/users/<user-id>/status \
  -H "Authorization: Bearer <manager-accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'
```

### Reset a user's password

```bash
curl -X POST http://localhost:3000/api/v1/users/<user-id>/reset-password \
  -H "Authorization: Bearer <staff-accessToken>"
```

---

## Notifications

### List my notifications

```bash
curl http://localhost:3000/api/v1/notifications \
  -H "Authorization: Bearer <accessToken>"
```

### Get unread count

```bash
curl http://localhost:3000/api/v1/notifications/unread-count \
  -H "Authorization: Bearer <accessToken>"
```

### Mark one as read

```bash
curl -X PATCH http://localhost:3000/api/v1/notifications/<notification-id>/read \
  -H "Authorization: Bearer <accessToken>"
```

### Mark all as read

```bash
curl -X PATCH http://localhost:3000/api/v1/notifications/read-all \
  -H "Authorization: Bearer <accessToken>"
```

### Create a notification (staff)

```bash
curl -X POST http://localhost:3000/api/v1/notifications \
  -H "Authorization: Bearer <staff-accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<user-id>",
    "title": "Library announcement",
    "message": "The library will be closed on Monday.",
    "type": "LOAN_APPROVED"
  }'
```

### Trigger overdue scan manually

```bash
curl -X POST http://localhost:3000/api/v1/notifications/overdue/scan \
  -H "Authorization: Bearer <staff-accessToken>"
```

### Telegram linking

```bash
# Get a link to connect Telegram
curl -X POST http://localhost:3000/api/v1/notifications/telegram/link \
  -H "Authorization: Bearer <accessToken>"

# Check if Telegram is linked
curl http://localhost:3000/api/v1/notifications/telegram \
  -H "Authorization: Bearer <accessToken>"

# Unlink Telegram
curl -X DELETE http://localhost:3000/api/v1/notifications/telegram \
  -H "Authorization: Bearer <accessToken>"
```

---

## Dashboard & activity logs (admin/librarian)

### Dashboard stats

```bash
curl http://localhost:3000/api/v1/dashboard/stats \
  -H "Authorization: Bearer <staff-accessToken>"
```

### Activity logs

```bash
# Recent logs
curl "http://localhost:3000/api/v1/activity-logs?page=1&limit=20" \
  -H "Authorization: Bearer <staff-accessToken>"

# Filter by action and date range
curl "http://localhost:3000/api/v1/activity-logs?action=APPROVE&from=2026-11-01&to=2026-11-16" \
  -H "Authorization: Bearer <staff-accessToken>"

# Filter dropdown values
curl http://localhost:3000/api/v1/activity-logs/facets \
  -H "Authorization: Bearer <staff-accessToken>"
```

---

## Common testing flow

Here's a step-by-step flow to test the full loan lifecycle:

```bash
# 1. Login as librarian
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"librarian1@libraflow.local","password":"libraflow-dev-password"}' \
  | jq -r '.accessToken')

# 2. Login as member
MEMBER_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"member1@libraflow.local","password":"libraflow-dev-password"}' \
  | jq -r '.accessToken')

# 3. List available copies
curl -s "http://localhost:3000/api/v1/books/1/copies?status=available" \
  -H "Authorization: Bearer $TOKEN" | jq

# 4. Request a loan (as member)
LOAN=$(curl -s -X POST http://localhost:3000/api/v1/loans/request \
  -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bookCopyIds":["<copy-id>"]}')
LOAN_ID=$(echo $LOAN | jq -r '.id')
echo "Loan ID: $LOAN_ID"

# 5. Approve the loan (as librarian)
curl -s -X PATCH "http://localhost:3000/api/v1/loans/$LOAN_ID/approve" \
  -H "Authorization: Bearer $TOKEN" | jq

# 6. Check loan detail (shows due date, live fines if overdue)
curl -s "http://localhost:3000/api/v1/loans/$LOAN_ID" \
  -H "Authorization: Bearer $TOKEN" | jq

# 7. Return the loan (as librarian)
curl -s -X PATCH "http://localhost:3000/api/v1/loans/$LOAN_ID/return" \
  -H "Authorization: Bearer $TOKEN" | jq

# 8. Check member's loans history
curl -s "http://localhost:3000/api/v1/loans/my?status=completed" \
  -H "Authorization: Bearer $MEMBER_TOKEN" | jq
```

---

## Enums reference

| Enum | Values |
|---|---|
| Loan status | `pending`, `active`, `completed`, `rejected` |
| Loan item status | `requested`, `borrowed`, `overdue`, `returned` |
| Copy status | `available`, `reserved`, `borrowed`, `lost` |
| Membership status | `pending_deposit`, `active`, `expired` |
| Membership tier | `standard`, `gold` |
| Role | `admin`, `manager`, `librarian`, `member` |
| Notification type | `LOAN_APPROVED`, `LOAN_REJECTED`, `LOAN_DUE_SOON`, `LOAN_DUE_TODAY`, `LOAN_OVERDUE`, `PAYMENT_RECEIVED` |
| Book item type | `book`, `limited_edition`, `research_paper` |
| Copy condition | `new`, `good`, `fair`, `poor`, `damaged` |

---

## Error responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Copy CP-000001 is borrowed.",
  "error": "Bad Request"
}
```

Common status codes:

| Code | Meaning |
|---|---|
| `400` | Bad request (validation failed, business rule violated) |
| `401` | Unauthorized (missing or expired token) |
| `403` | Forbidden (wrong role or accessing another member's data) |
| `404` | Not found |
