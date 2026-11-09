// Fills a LOCAL database with ~4 months of believable library activity so the dashboard,
// activity logs and metrics have something to show. Rebuilds the schema first, and
// refuses to run against anything but localhost/Docker. `npm run seed:dev`
import 'dotenv/config';
import { faker } from '@faker-js/faker';
import { PasswordService } from '../../auth/password/password.service';
import { describeActivity } from '../../dashboard/describe-activity';
import { insertRows, syncSequence, type Row } from '../insert-rows';
import { localDataSource, resetSchema } from '../local-db';

faker.seed(2026);

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const HISTORY_DAYS = 120;
const ACTIVITY_DAYS = 60;
const NOTIFICATION_DAYS = 30;
const LOAN_DAYS = 14;
const FINE_PER_DAY = 0.25;
const DEPOSIT = 10;
// Every seeded account logs in with this password (local databases only; the
// seed refuses anything else). Override it with SEED_DEV_PASSWORD.
const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? 'libraflow-dev-password';

type Staff = { id: number; username: string; ip: string };
type Member = {
  id: number;
  userId: number;
  joinedMs: number;
  expiryMs: number;
  status: string;
};
type Copy = {
  id: number;
  code: string;
  freeAt: number;
  addedMs: number;
  lost: boolean;
  open?: 'borrowed' | 'reserved';
};
type Activity = {
  at: number;
  staff: Staff;
  action: string;
  entityType: string;
  entityId: number;
  label?: string;
};
type Notice = {
  at: number;
  userId: number;
  type: string;
  title: string;
  message: string;
};

const ago = (days: number) => NOW - days * DAY;
const at = (ms: number) => new Date(ms);
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pad = (n: number, width = 5) => String(n).padStart(width, '0');
const between = (min: number, max: number) => faker.number.float({ min, max });
const chance = (p: number) => faker.number.float() < p;
const money = (n: number) => n.toFixed(2);
const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

const CATEGORIES = [
  ['Fiction', 'Novels and short stories'],
  ['Science', 'Physics, chemistry, biology and astronomy'],
  ['Technology', 'Computing, engineering and programming'],
  ['History', 'World and Cambodian history'],
  ['Business', 'Management, finance and entrepreneurship'],
  ['Children', 'Picture books and early readers'],
  ['Philosophy', 'Ethics, logic and religion'],
  ['Arts', 'Design, music, film and photography'],
  ['Health', 'Medicine, nutrition and fitness'],
  ['Languages', 'Dictionaries, grammar and language learning'],
];

function build(passwordHash: string) {
  const roles: Row[] = [
    ['admin', 'Full access, including observability'],
    ['librarian', 'Runs circulation, payments and the catalog'],
    ['member', 'Borrows books'],
  ].map(([name, description], i) => ({
    id: i + 1,
    name,
    description,
    created_at: at(ago(520)),
    updated_at: at(ago(520)),
  }));

  // People
  const users: Row[] = [];
  const addUser = (
    roleId: number,
    first: string,
    last: string,
    createdMs: number,
    username?: string,
    status = 'active',
  ) => {
    const id = users.length + 1;
    const name =
      username ?? `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + id;
    users.push({
      id,
      role_id: roleId,
      username: name,
      email: `${name}@libraflow.local`,
      password_hash: passwordHash,
      first_name: first,
      last_name: last,
      phone: `+855 ${faker.string.numeric(2)} ${faker.string.numeric(3)} ${faker.string.numeric(3)}`,
      status,
      created_at: at(createdMs),
      updated_at: at(createdMs),
    });
    return { id, username: name };
  };

  const admin: Staff = {
    ...addUser(1, 'Library', 'Admin', ago(500), 'admin'),
    ip: '10.0.0.5',
  };
  const librarians: Staff[] = [1, 2, 3, 4].map((n) => ({
    ...addUser(
      2,
      faker.person.firstName(),
      faker.person.lastName(),
      ago(between(300, 480)),
      `librarian${n}`,
    ),
    ip: `10.0.1.${10 + n}`,
  }));
  const staff = [admin, ...librarians];

  const memberRows: Row[] = [];
  const members: Member[] = [];
  for (let i = 0; i < 120; i++) {
    // The first three are predictable accounts (member1..3@libraflow.local) with
    // an active membership, for logging in by hand and for `npm run simulate`.
    const knownMember = i < 3;
    const joinedMs = knownMember ? ago(between(1, 200)) : ago(between(1, 420));
    const expiryMs = joinedMs + 365 * DAY;
    // Account status is active or disabled (an admin's decision)
    const userStatus = knownMember
      ? 'active'
      : faker.helpers.weightedArrayElement([
          { value: 'active', weight: 95 },
          { value: 'disabled', weight: 5 },
        ]);
    const user = addUser(
      3,
      faker.person.firstName(),
      faker.person.lastName(),
      joinedMs,
      knownMember ? `member${i + 1}` : undefined,
      userStatus,
    );
    // "blocked" here is the simulation's late-return penalty: stored as an
    // active membership with blocked_until in the future, never as a status.
    const status = knownMember
      ? 'active'
      : expiryMs < NOW
        ? 'expired'
        : userStatus === 'disabled'
          ? 'blocked'
          : faker.helpers.weightedArrayElement([
              { value: 'active', weight: 88 },
              { value: 'pending_deposit', weight: 9 },
              { value: 'blocked', weight: 3 },
            ]);
    const id = members.length + 1;
    members.push({ id, userId: user.id, joinedMs, expiryMs, status });
    memberRows.push({
      id,
      user_id: user.id,
      member_code: `MEM-${pad(id)}`,
      membership_date: dateOnly(joinedMs),
      // No expiry until the deposit is verified
      expiry_date: status === 'pending_deposit' ? null : dateOnly(expiryMs),
      membership_status: status === 'blocked' ? 'active' : status,
      deposit_amount: money(status === 'pending_deposit' ? 0 : DEPOSIT),
      blocked_until:
        status === 'blocked' ? at(NOW + between(3, 30) * DAY) : null,
      created_at: at(joinedMs),
      updated_at: at(joinedMs),
    });
  }

  // Catalog
  const categories: Row[] = CATEGORIES.map(([name, description], i) => ({
    id: i + 1,
    name,
    description,
    created_at: at(ago(520)),
    updated_at: at(ago(520)),
  }));
  const authors: Row[] = Array.from({ length: 60 }, (_, i) => ({
    id: i + 1,
    name: faker.person.fullName(),
    created_at: at(ago(520)),
    updated_at: at(ago(520)),
  }));

  const books: Row[] = [];
  const bookAuthors: Row[] = [];
  const copyRows: Row[] = [];
  const copiesByBook = new Map<number, Copy[]>();
  const titles = new Set<string>();
  const isbns = new Set<string>();
  // A few books are borrowed far more than the rest, like a real library
  const popularity = faker.helpers.shuffle(
    Array.from({ length: 180 }, (_, i) => 1 / Math.pow(i + 1, 0.75)),
  );
  for (let id = 1; id <= 180; id++) {
    let title = faker.book.title();
    for (let tries = 0; titles.has(title) && tries < 5; tries++)
      title = faker.book.title();
    if (titles.has(title)) title = `${title}, Vol. ${id}`;
    titles.add(title);
    let isbn = faker.commerce.isbn(13);
    while (isbns.has(isbn)) isbn = faker.commerce.isbn(13);
    isbns.add(isbn);

    const createdMs = id <= 170 ? ago(between(130, 500)) : ago(between(5, 100));
    const categoryId = chance(0.04)
      ? null
      : faker.number.int({ min: 1, max: CATEGORIES.length });
    books.push({
      id,
      category_id: categoryId,
      isbn,
      title,
      publisher: faker.book.publisher(),
      published_date: dateOnly(faker.date.past({ years: 40 }).getTime()),
      description: faker.lorem.sentences({ min: 1, max: 3 }),
      language: faker.helpers.weightedArrayElement([
        { value: 'English', weight: 85 },
        { value: 'Khmer', weight: 8 },
        { value: 'French', weight: 7 },
      ]),
      created_at: at(createdMs),
      updated_at: at(createdMs),
    });
    for (const authorId of faker.helpers.arrayElements(
      authors,
      chance(0.15) ? 2 : 1,
    )) {
      bookAuthors.push({ book_id: id, author_id: authorId.id });
    }

    const copies: Copy[] = [];
    const copyCount =
      1 + faker.number.int(2) + (popularity[id - 1] > 0.15 ? 1 : 0);
    for (let n = 0; n < copyCount; n++) {
      const copyId = copyRows.length + 1;
      const copy: Copy = {
        id: copyId,
        code: `CP-${pad(copyId)}`,
        freeAt: 0,
        addedMs: createdMs,
        lost: chance(0.02),
      };
      copies.push(copy);
      copyRows.push({
        id: copyId,
        book_id: id,
        copy_code: copy.code,
        condition: faker.helpers.weightedArrayElement([
          { value: 'good', weight: 60 },
          { value: 'new', weight: 32 },
          { value: 'damaged', weight: 8 },
        ]),
        status: 'available',
        location: `${'ABCDEF'[(categoryId ?? 0) % 6]}-${faker.number.int({ min: 1, max: 12 })}`,
        created_at: at(createdMs),
        updated_at: at(createdMs),
      });
    }
    copiesByBook.set(id, copies);
  }

  // Circulation, replayed day by day so a copy is never lent twice at once
  const loans: Row[] = [];
  const items: Row[] = [];
  const payments: Row[] = [];
  const activities: Activity[] = [];
  const notices: Notice[] = [];
  const bookWeights = books.map((book, i) => ({
    value: book.id as number,
    weight: popularity[i],
  }));
  const libraryStaff = () => faker.helpers.arrayElement(librarians);

  const addPayment = (
    memberId: number,
    amount: number,
    type: 'deposit' | 'fine',
    paidMs: number,
    notes?: string,
  ) => {
    const id = payments.length + 1;
    const method = chance(type === 'deposit' ? 0.4 : 0.7) ? 'cash' : 'khqr';
    payments.push({
      id,
      member_id: memberId,
      payment_code: `PAY-${pad(id, 6)}`,
      amount: money(amount),
      payment_method: method,
      payment_type: type,
      payment_date: at(paidMs),
      status: faker.helpers.weightedArrayElement([
        { value: 'completed', weight: 90 },
        { value: 'pending', weight: 7 },
        { value: 'failed', weight: 3 },
      ]),
      reference_number:
        method === 'khqr' ? `KHQR${faker.string.numeric(12)}` : null,
      notes: notes ?? null,
      created_at: at(paidMs),
      updated_at: at(paidMs),
    });
    // Cash is keyed in at the desk; KHQR confirms itself
    if (method === 'cash') {
      activities.push({
        at: paidMs,
        staff: libraryStaff(),
        action: 'CREATE',
        entityType: 'Payment',
        entityId: id,
        label: `PAY-${pad(id, 6)}`,
      });
    }
    const member = members[memberId - 1];
    notices.push({
      at: paidMs,
      userId: member.userId,
      type: 'payment_received',
      title: type === 'deposit' ? 'Deposit received' : 'Fine paid',
      message: `We received your ${type} of $${money(amount)} via ${method === 'cash' ? 'cash' : 'KHQR'}.`,
    });
  };

  for (const member of members) {
    if (member.status === 'pending_deposit') continue;
    const paidMs = Math.min(member.joinedMs + between(0, 48) * HOUR, NOW);
    addPayment(member.id, DEPOSIT, 'deposit', paidMs, 'Membership deposit');
    activities.push({
      at: member.joinedMs,
      staff: libraryStaff(),
      action: 'CREATE',
      entityType: 'Member',
      entityId: member.id,
      label: `MEM-${pad(member.id)}`,
    });
  }

  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const dayStart = startOfDay(ago(d));
    const weekend = [0, 6].includes(new Date(dayStart).getDay());
    const growth = 0.8 + 0.4 * (1 - d / HISTORY_DAYS);
    const count = Math.max(
      0,
      Math.round((weekend ? 3 : 7) * growth + between(-2, 2)),
    );

    for (let k = 0; k < count; k++) {
      const loanMs = dayStart + between(8, 19) * HOUR;
      if (loanMs > NOW) continue;
      const eligible = members.filter(
        (m) =>
          m.status !== 'pending_deposit' &&
          m.joinedMs <= loanMs &&
          m.expiryMs > loanMs,
      );
      if (!eligible.length) continue;
      const member = faker.helpers.arrayElement(eligible);

      const wanted = faker.helpers.weightedArrayElement([
        { value: 1, weight: 70 },
        { value: 2, weight: 22 },
        { value: 3, weight: 8 },
      ]);
      const chosen: Copy[] = [];
      for (let n = 0; n < wanted; n++) {
        const bookId = faker.helpers.weightedArrayElement(bookWeights);
        const copy = copiesByBook
          .get(bookId)!
          .find(
            (c) =>
              !c.lost &&
              c.freeAt <= loanMs &&
              c.addedMs <= loanMs &&
              !chosen.includes(c),
          );
        if (copy) chosen.push(copy);
      }
      if (!chosen.length) continue;

      const loanId = loans.length + 1;
      const loanCode = `LN-${pad(loanId, 6)}`;
      // A request whose decision would land in the future is still waiting on a librarian
      const decidedMs = loanMs + between(0.3, 20) * HOUR;
      const outcome =
        decidedMs > NOW || (NOW - loanMs < 48 * HOUR && chance(0.4))
          ? 'pending'
          : chance(0.06)
            ? 'rejected'
            : 'approved';
      let lastChange = loanMs;
      let allReturned = true;

      if (outcome === 'rejected') {
        const rejectedMs = decidedMs;
        lastChange = rejectedMs;
        activities.push({
          at: rejectedMs,
          staff: libraryStaff(),
          action: 'REJECT',
          entityType: 'Loan',
          entityId: loanId,
          label: loanCode,
        });
        notices.push({
          at: rejectedMs,
          userId: member.userId,
          type: 'loan_rejected',
          title: 'Loan request rejected',
          message: `Your request ${loanCode} was rejected. Please ask at the desk.`,
        });
      }
      const approvedMs = decidedMs;
      if (outcome === 'approved') {
        lastChange = approvedMs;
        activities.push({
          at: approvedMs,
          staff: libraryStaff(),
          action: 'APPROVE',
          entityType: 'Loan',
          entityId: loanId,
          label: loanCode,
        });
        notices.push({
          at: approvedMs,
          userId: member.userId,
          type: 'loan_approved',
          title: 'Loan approved',
          message: `${loanCode} is ready. Due back in ${LOAN_DAYS} days.`,
        });
      }

      for (const copy of chosen) {
        const itemId = items.length + 1;
        if (outcome !== 'approved') {
          if (outcome === 'pending') {
            copy.freeAt = Infinity;
            copy.open = 'reserved';
          }
          items.push({
            id: itemId,
            loan_id: loanId,
            book_copy_id: copy.id,
            borrowed_at: at(loanMs),
            due_date: at(loanMs + LOAN_DAYS * DAY),
            returned_at: null,
            status: 'requested',
            fine_amount: money(0),
            created_at: at(loanMs),
            updated_at: at(lastChange),
          });
          allReturned = false;
          continue;
        }

        const dueMs = approvedMs + LOAN_DAYS * DAY;
        const keptDays = faker.helpers.weightedArrayElement([
          { value: between(2, 13.5), weight: 75 },
          { value: between(14.5, 24), weight: 18 },
          { value: between(25, 45), weight: 7 },
        ]);
        const returnMs = approvedMs + keptDays * DAY;
        const returned = returnMs <= NOW;
        const lateDays = Math.max(
          0,
          Math.ceil(((returned ? returnMs : NOW) - dueMs) / DAY),
        );
        const fine = lateDays * FINE_PER_DAY;

        if (returned) {
          copy.freeAt = returnMs;
          copy.open = undefined;
          activities.push({
            at: returnMs,
            staff: libraryStaff(),
            action: 'RETURN',
            entityType: 'LoanItem',
            entityId: itemId,
            label: copy.code,
          });
          if (fine > 0 && returnMs + 2 * DAY < NOW) {
            addPayment(
              member.id,
              fine,
              'fine',
              returnMs + between(0, 2) * DAY,
              `${lateDays} days late on ${copy.code}`,
            );
          }
        } else {
          copy.freeAt = Infinity;
          copy.open = 'borrowed';
          allReturned = false;
        }
        if (!returned || returnMs > dueMs - 2 * DAY) {
          if (dueMs - 2 * DAY <= NOW) {
            notices.push({
              at: dueMs - 2 * DAY,
              userId: member.userId,
              type: 'due_soon',
              title: 'Due in 2 days',
              message: `${copy.code} from ${loanCode} is due in 2 days.`,
            });
          }
        }
        if (lateDays > 0 && dueMs + DAY <= NOW) {
          notices.push({
            at: dueMs + DAY,
            userId: member.userId,
            type: 'overdue',
            title: 'Book overdue',
            message: `${copy.code} is overdue. Fines are $${money(FINE_PER_DAY)} a day.`,
          });
        }

        lastChange = Math.max(lastChange, returned ? returnMs : approvedMs);
        items.push({
          id: itemId,
          loan_id: loanId,
          book_copy_id: copy.id,
          borrowed_at: at(approvedMs),
          due_date: at(dueMs),
          returned_at: returned ? at(returnMs) : null,
          status: returned ? 'returned' : dueMs < NOW ? 'overdue' : 'borrowed',
          fine_amount: money(fine),
          created_at: at(loanMs),
          updated_at: at(returned ? returnMs : approvedMs),
        });
      }

      loans.push({
        id: loanId,
        member_id: member.id,
        loan_code: loanCode,
        loan_date: at(loanMs),
        status:
          outcome === 'pending'
            ? 'pending'
            : outcome === 'rejected'
              ? 'rejected'
              : allReturned
                ? 'completed'
                : 'active',
        notes: chance(0.05)
          ? faker.helpers.arrayElement([
              'Course reserve',
              'Requested at the desk',
              'Renewal',
            ])
          : null,
        created_at: at(loanMs),
        updated_at: at(lastChange),
      });
    }
  }

  for (const copy of [...copiesByBook.values()].flat()) {
    copyRows[copy.id - 1].status = copy.lost
      ? 'lost'
      : (copy.open ?? 'available');
  }

  // Catalog edits, blocks and logins round out the staff activity
  for (const book of books.filter(
    (b) => (b.created_at as Date).getTime() > ago(ACTIVITY_DAYS),
  )) {
    activities.push({
      at: (book.created_at as Date).getTime(),
      staff: libraryStaff(),
      action: 'CREATE',
      entityType: 'Book',
      entityId: book.id as number,
      label: book.title as string,
    });
  }
  for (let n = 0; n < 25; n++) {
    const book = faker.helpers.arrayElement(books);
    activities.push({
      at: ago(between(0, ACTIVITY_DAYS)),
      staff: libraryStaff(),
      action: 'UPDATE',
      entityType: 'Book',
      entityId: book.id as number,
      label: book.title as string,
    });
  }
  for (const member of members.filter((m) => m.status === 'blocked')) {
    activities.push({
      at: ago(between(0, ACTIVITY_DAYS)),
      staff: admin,
      action: 'UPDATE',
      entityType: 'Member',
      entityId: member.id,
      label: `MEM-${pad(member.id)}`,
    });
  }
  for (let d = ACTIVITY_DAYS; d >= 0; d--) {
    const dayStart = startOfDay(ago(d));
    if ([0, 6].includes(new Date(dayStart).getDay())) continue;
    for (const person of staff) {
      if (person === admin && !chance(0.4)) continue;
      const loginMs = dayStart + between(7.5, 9.5) * HOUR;
      if (loginMs <= NOW)
        activities.push({
          at: loginMs,
          staff: person,
          action: 'LOGIN',
          entityType: 'User',
          entityId: person.id,
        });
    }
  }

  const activityLogs: Row[] = activities
    .filter((a) => a.at >= ago(ACTIVITY_DAYS) && a.at <= NOW)
    .sort((a, b) => a.at - b.at)
    .map((a, i) => ({
      id: i + 1,
      user_id: a.staff.id,
      action: a.action,
      entity_type: a.entityType,
      entity_id: String(a.entityId),
      description: describeActivity({
        username: a.staff.username,
        action: a.action,
        entityType: a.entityType,
        entityId: String(a.entityId),
        label: a.label,
      }),
      ip_address: a.staff.ip,
      created_at: at(a.at),
    }));

  const notifications: Row[] = notices
    .filter((n) => n.at >= ago(NOTIFICATION_DAYS) && n.at <= NOW)
    .sort((a, b) => a.at - b.at)
    .map((n, i) => ({
      id: i + 1,
      user_id: n.userId,
      title: n.title,
      message: n.message,
      type: n.type,
      read_at: chance(0.6)
        ? at(Math.min(n.at + between(0.2, 48) * HOUR, NOW))
        : null,
      created_at: at(n.at),
    }));

  // Insertion order follows the foreign keys
  return {
    roles,
    users,
    members: memberRows,
    categories,
    authors,
    books,
    book_authors: bookAuthors,
    book_copies: copyRows,
    loans,
    loan_items: items,
    payments,
    notifications,
    activity_logs: activityLogs,
  };
}

async function main() {
  const dataSource = localDataSource();
  await dataSource.initialize();
  console.log(
    `Rebuilding the schema in ${dataSource.driver.database} and seeding dummy data…`,
  );
  await resetSchema(dataSource);

  const passwordHash = await new PasswordService().hash(DEV_PASSWORD);
  const tables = build(passwordHash);
  for (const [table, rows] of Object.entries(tables))
    await insertRows(dataSource, table, rows);
  for (const table of Object.keys(tables).filter((t) => t !== 'book_authors'))
    await syncSequence(dataSource, table);

  console.table(
    Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [table, rows.length]),
    ),
  );
  console.log(
    `Log in as admin@libraflow.local, librarian1..4@libraflow.local or member1..3@libraflow.local with the dev password (SEED_DEV_PASSWORD, default "${DEV_PASSWORD === 'libraflow-dev-password' ? DEV_PASSWORD : '<your SEED_DEV_PASSWORD>'}").`,
  );
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
