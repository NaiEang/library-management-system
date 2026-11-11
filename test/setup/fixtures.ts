import type { DataSource } from 'typeorm';
import {
  insertRows,
  syncSequence,
  type Row,
} from '../../src/database/insert-rows';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const USERS = {
  admin: 1,
  librarian: 2,
  member: 3,
  pendingMember: 4,
  inactiveMember: 5,
};

/**
 * A small library whose dashboard numbers are known exactly. Times are relative to
 * now so "overdue" and "due soon" stay true whenever the suite runs.
 */
export async function seedFixtures(dataSource: DataSource) {
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now + offsetMs);
  const startOfMonth = new Date(
    new Date(now).getFullYear(),
    new Date(now).getMonth(),
    1,
  ).getTime();
  const created = { created_at: at(-60 * DAY), updated_at: at(-60 * DAY) };

  const user = (
    id: number,
    roleId: number,
    username: string,
    status = 'active',
  ) => ({
    id,
    role_id: roleId,
    username,
    email: `${username}@test.local`,
    password_hash: '!test',
    first_name: username.split('.')[0],
    last_name: 'Test',
    phone: null,
    status,
    ...created,
  });
  const copy = (id: number, bookId: number, status: string) => ({
    id,
    book_id: bookId,
    copy_code: `CP-${id}`,
    condition: 'good',
    status,
    location: 'A-1',
    ...created,
  });
  const item = (
    id: number,
    loanId: number,
    copyId: number,
    status: string,
    borrowed: number,
    due: number,
    extra: Row = {},
  ) => ({
    id,
    loan_id: loanId,
    book_copy_id: copyId,
    borrowed_at: at(borrowed),
    due_date: at(due),
    returned_at: null,
    status,
    fine_amount: '0.00',
    created_at: at(borrowed),
    updated_at: at(borrowed),
    ...extra,
  });

  const tables: Record<string, Row[]> = {
    // ids 1-3 as before; manager (added later) is 4
    roles: ['admin', 'librarian', 'member', 'manager'].map((name, i) => ({
      id: i + 1,
      name,
      description: null,
      ...created,
    })),
    users: [
      user(USERS.admin, 1, 'admin'),
      user(USERS.librarian, 2, 'librarian'),
      user(USERS.member, 3, 'member.one'),
      user(USERS.pendingMember, 3, 'member.two'),
      user(USERS.inactiveMember, 3, 'member.three', 'disabled'),
    ],
    members: (
      [
        [1, USERS.member, 'active', '10.00', null],
        [2, USERS.pendingMember, 'pending_deposit', '0.00', null],
        // "Blocked" is not a status: an active membership with a late-return penalty
        [3, USERS.inactiveMember, 'active', '10.00', at(7 * DAY)],
      ] as [number, number, string, string, Date | null][]
    ).map(([id, userId, status, deposit, blockedUntil]) => ({
      id,
      user_id: userId,
      member_code: `MEM-${id}`,
      membership_date: at(-60 * DAY)
        .toISOString()
        .slice(0, 10),
      expiry_date: at(300 * DAY)
        .toISOString()
        .slice(0, 10),
      membership_status: status,
      deposit_amount: deposit,
      blocked_until: blockedUntil,
      ...created,
    })),
    categories: [
      { id: 1, name: 'Fiction', description: null, ...created },
      { id: 2, name: 'Science', description: null, ...created },
    ],
    authors: [
      { id: 1, name: 'Ada Writer', ...created },
      { id: 2, name: 'Ben Author', ...created },
    ],
    books: [
      [1, 1, 'Alpha'],
      [2, 2, 'Beta'],
      [3, null, 'Gamma'],
    ].map(([id, categoryId, title]) => ({
      id,
      category_id: categoryId,
      isbn: `978000000000${id}`,
      title,
      publisher: null,
      published_date: null,
      description: null,
      language: 'English',
      ...created,
    })),
    book_authors: [
      { book_id: 1, author_id: 1 },
      { book_id: 1, author_id: 2 },
      { book_id: 2, author_id: 2 },
    ],
    book_copies: [
      copy(1, 1, 'borrowed'),
      copy(2, 1, 'available'),
      copy(3, 2, 'borrowed'),
      copy(4, 2, 'reserved'),
      copy(5, 3, 'lost'),
      copy(6, 3, 'available'),
      copy(7, 2, 'borrowed'),
    ],
    loans: [
      [1, 'active', -5 * DAY],
      [2, 'active', -20 * DAY],
      [3, 'pending', -HOUR],
      [4, 'completed', -10 * DAY],
      [5, 'rejected', -3 * DAY],
    ].map(([id, status, offset]) => ({
      id,
      member_id: 1,
      loan_code: `LN-${id}`,
      loan_date: at(offset as number),
      status,
      notes: null,
      created_at: at(offset as number),
      updated_at: at(offset as number),
    })),
    loan_items: [
      item(1, 1, 1, 'borrowed', -5 * DAY, 9 * DAY),
      // 6 days late at $0.25 a day
      item(2, 2, 3, 'overdue', -20 * DAY, -6 * DAY, { fine_amount: '1.50' }),
      item(3, 3, 4, 'requested', -HOUR, 14 * DAY - HOUR),
      // Returned inside the current month, even when the suite runs just after midnight on the 1st
      item(4, 4, 2, 'returned', -10 * DAY, 4 * DAY, {
        returned_at: new Date(Math.max(now - HOUR, startOfMonth + 1000)),
      }),
      item(5, 5, 6, 'requested', -3 * DAY, 11 * DAY),
      item(6, 1, 7, 'borrowed', -13 * DAY, DAY),
    ],
    payments: [
      [1, '10.00', 'deposit', 'completed', -29 * DAY],
      [2, '0.75', 'fine', 'completed', -2 * DAY],
      [3, '5.00', 'fine', 'failed', -DAY],
    ].map(([id, amount, type, status, offset]) => ({
      id,
      member_id: 1,
      payment_code: `PAY-${id}`,
      amount,
      payment_method: 'cash',
      payment_type: type,
      payment_date: at(offset as number),
      status,
      reference_number: null,
      notes: null,
      created_at: at(offset as number),
      updated_at: at(offset as number),
    })),
    notifications: [],
    activity_logs: [
      [1, USERS.admin, 'LOGIN', 'User', '1', 'admin logged in', -2 * HOUR],
      [
        2,
        USERS.librarian,
        'APPROVE',
        'Loan',
        '1',
        'librarian approved Loan #1 "LN-1"',
        -90 * 60_000,
      ],
      [
        3,
        USERS.librarian,
        'RETURN',
        'LoanItem',
        '4',
        'librarian checked in LoanItem #4 "CP-2"',
        -HOUR,
      ],
    ].map(
      ([id, userId, action, entityType, entityId, description, offset]) => ({
        id,
        user_id: userId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        description,
        ip_address: '10.0.0.1',
        created_at: at(offset as number),
      }),
    ),
  };

  for (const [table, rows] of Object.entries(tables))
    await insertRows(dataSource, table, rows);
  for (const table of Object.keys(tables).filter((t) => t !== 'book_authors'))
    await syncSequence(dataSource, table);
}
