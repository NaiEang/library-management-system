import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Repository } from 'typeorm';
import type { LoanItem } from '../../loans/entities/loan-item.entity';
import type { Notifier } from '../channels/notifier';
import type { NotificationsService } from '../notifications.service';
import type { TelegramLinkService } from '../telegram/telegram-link.service';
import { OverdueNotificationProcessor } from './overdue-notification.processor';
import type { OverdueJobData } from './overdue.constants';

// Tests run at 2026-11-12 08:00 in Phnom Penh (UTC+7)
const NOW = new Date('2026-11-12T01:00:00Z');

const overdueItem = {
  id: '2',
  status: 'overdue',
  returnedAt: null,
  // Mon 9 Nov, 15:00 Phnom Penh: 3 library days late
  dueDate: new Date('2026-11-09T08:00:00Z'),
  loan: {
    member: {
      user: { id: '7', email: 'student@example.com', username: 'student', firstName: 'Sok', lastName: 'Dara' },
    },
  },
  bookCopy: { book: { title: 'Clean Code' } },
};
// Fri 13 Nov, 10:00 Phnom Penh
const borrowedItem = {
  ...overdueItem,
  status: 'borrowed',
  dueDate: new Date('2026-11-13T03:00:00Z'),
};

function channel(name: string, error?: Error) {
  const send = vi.fn(() => (error ? Promise.reject(error) : Promise.resolve()));
  return { channel: name, send } as Notifier & { send: typeof send };
}

function setup(
  item: unknown,
  notifiers: Array<Notifier & { send: ReturnType<typeof vi.fn> }> = [channel('test')],
  chatId: string | null = null,
) {
  const findOne = vi.fn(() => Promise.resolve(item));
  const create = vi.fn(() => Promise.resolve({ id: '99' }));
  const processor = new OverdueNotificationProcessor(
    { findOne } as unknown as Repository<LoanItem>,
    { create } as unknown as NotificationsService,
    notifiers,
    { chatIdOf: () => Promise.resolve(chatId) } as unknown as TelegramLinkService,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { processor, create, send: notifiers[0].send };
}

function job(data: OverdueJobData) {
  const updateData = vi.fn((next: OverdueJobData) => {
    current.data = next;
    return Promise.resolve();
  });
  const current = { data, attemptsMade: 0, updateData };
  return current as unknown as Job<OverdueJobData> & { updateData: typeof updateData };
}

describe('OverdueNotificationProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('saves an in-app notification and sends the overdue message', async () => {
    const { processor, create, send } = setup(overdueItem);
    const j = job({ loanItemId: '2' });

    await expect(processor.process(j)).resolves.toEqual({
      sent: true,
      channels: ['test'],
      notificationId: '99',
    });

    const text =
      '"Clean Code" was due on Mon, 9 Nov 2026 and is now 3 days overdue.\n\n' +
      "You can't borrow other books until it is returned, and late fees may apply. " +
      'Please return it to the library as soon as possible.';
    expect(create).toHaveBeenCalledWith({
      userId: '7',
      type: 'LOAN_OVERDUE',
      title: 'Your book is overdue',
      message: text,
    });
    expect(send).toHaveBeenCalledWith({
      to: { userId: '7', email: 'student@example.com', name: 'Sok Dara', telegramChatId: null },
      subject: 'Your book is overdue',
      text,
      icon: '⚠️',
    });
    expect(j.data).toEqual({ loanItemId: '2', notificationId: '99', delivered: ['test'] });
  });

  it.each([
    [
      'due-tomorrow',
      'LOAN_DUE_SOON',
      'Your book is due tomorrow',
      /^Friendly reminder: "Clean Code" is due back tomorrow, Fri, 13 Nov 2026\./,
    ],
    [
      'due-today',
      'LOAN_DUE_TODAY',
      'Your book is due today',
      /^"Clean Code" is due back today, Fri, 13 Nov 2026\./,
    ],
  ] as const)('sends the %s reminder for a borrowed book', async (kind, type, title, text) => {
    const { processor, create, send } = setup(borrowedItem);
    await processor.process(job({ loanItemId: '2', kind }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type, title, message: expect.stringMatching(text) as unknown }),
    );
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: title }));
  });

  it('sends on every channel, with the linked Telegram chat', async () => {
    const email = channel('email');
    const telegram = channel('telegram');
    const { processor } = setup(overdueItem, [email, telegram], '555');
    await expect(processor.process(job({ loanItemId: '2' }))).resolves.toMatchObject({
      channels: ['email', 'telegram'],
    });
    expect(telegram.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.objectContaining({ telegramChatId: '555' }) as unknown }),
    );
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('on retry, skips the channels that already delivered', async () => {
    const email = channel('email');
    const telegram = channel('telegram');
    const { processor, create } = setup(overdueItem, [email, telegram], '555');
    await processor.process(
      job({ loanItemId: '2', notificationId: '99', delivered: ['email'] }),
    );
    expect(create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect(telegram.send).toHaveBeenCalledTimes(1);
  });

  it('fails the job when a channel fails, remembering the ones that delivered', async () => {
    const email = channel('email');
    const telegram = channel('telegram', new Error('Telegram down'));
    const { processor } = setup(overdueItem, [email, telegram], '555');
    const j = job({ loanItemId: '2' });
    await expect(processor.process(j)).rejects.toThrow('Telegram down');
    expect(j.data.delivered).toEqual(['email']);
  });

  it.each([
    ['the item no longer exists', 'overdue', null, 'not-found'],
    ['the book was returned', 'overdue', { ...overdueItem, status: 'returned', returnedAt: new Date() }, 'no-longer-applies'],
    ['a due-date reminder finds the book already overdue', 'due-today', overdueItem, 'no-longer-applies'],
  ] as const)('skips when %s', async (_case, kind, item, reason) => {
    const { processor, create, send } = setup(item);
    await expect(processor.process(job({ loanItemId: '2', kind }))).resolves.toEqual({
      sent: false,
      reason,
    });
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
