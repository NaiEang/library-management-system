import type { Job } from 'bullmq';
import type { Repository } from 'typeorm';
import type { LoanItem } from '../../loans/entities/loan-item.entity';
import type { Notifier } from '../channels/notifier';
import type { NotificationsService } from '../notifications.service';
import { OverdueNotificationProcessor } from './overdue-notification.processor';
import type { OverdueJobData } from './overdue.constants';

const overdueItem = {
  id: '2',
  status: 'overdue',
  returnedAt: null,
  loan: {
    member: {
      user: { id: '7', email: 'student@example.com', username: 'student', firstName: 'Sok', lastName: 'Dara' },
    },
  },
  bookCopy: { book: { title: 'Clean Code' } },
};

function setup(item: unknown, notifierError?: Error) {
  const findOne = vi.fn(() => Promise.resolve(item));
  const create = vi.fn(() => Promise.resolve({ id: '99' }));
  const send = vi.fn(() =>
    notifierError ? Promise.reject(notifierError) : Promise.resolve(),
  );
  const processor = new OverdueNotificationProcessor(
    { findOne } as unknown as Repository<LoanItem>,
    { create } as unknown as NotificationsService,
    { channel: 'test', send } as Notifier,
  );
  return { processor, create, send };
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
  it('saves an in-app notification and sends the overdue message', async () => {
    const { processor, create, send } = setup(overdueItem);
    const j = job({ loanItemId: '2' });

    await expect(processor.process(j)).resolves.toEqual({
      sent: true,
      channel: 'test',
      notificationId: '99',
    });

    const text = 'Your book "Clean Code" is overdue. You are blocked until you return it.';
    expect(create).toHaveBeenCalledWith({
      userId: '7',
      type: 'LOAN_OVERDUE',
      title: 'Book overdue',
      message: text,
    });
    expect(send).toHaveBeenCalledWith({
      to: { userId: '7', email: 'student@example.com', name: 'Sok Dara' },
      subject: 'Book overdue',
      text,
    });
    expect(j.updateData).toHaveBeenCalledWith({ loanItemId: '2', notificationId: '99' });
  });

  it('does not save a second notification when a failed send is retried', async () => {
    const { processor, create, send } = setup(overdueItem);
    await processor.process(job({ loanItemId: '2', notificationId: '99' }));
    expect(create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('fails the job when sending fails, so BullMQ retries it', async () => {
    const { processor } = setup(overdueItem, new Error('SMTP down'));
    await expect(processor.process(job({ loanItemId: '2' }))).rejects.toThrow('SMTP down');
  });

  it.each([
    ['the item no longer exists', null, 'not-found'],
    ['the book was returned', { ...overdueItem, status: 'returned', returnedAt: new Date() }, 'no-longer-overdue'],
  ])('skips when %s', async (_case, item, reason) => {
    const { processor, create, send } = setup(item);
    await expect(processor.process(job({ loanItemId: '2' }))).resolves.toEqual({
      sent: false,
      reason,
    });
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
