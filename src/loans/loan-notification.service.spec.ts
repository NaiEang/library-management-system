import type { Repository } from 'typeorm';
import type { Member } from '../members/entities/member.entity';
import type { Notifier } from '../notifications/channels/notifier';
import type { NotificationsService } from '../notifications/notifications.service';
import type { TelegramLinkService } from '../notifications/telegram/telegram-link.service';
import type { Loan } from './entities/loan.entity';
import { LoanNotificationService } from './loan-notification.service';

const loan = { id: '50', memberId: '1', loanCode: 'LN-123' } as Loan;

const memberWithUser = {
  id: '1',
  user: {
    id: '7',
    email: 'student@example.com',
    username: 'student',
    firstName: 'Sok',
    lastName: 'Dara',
  },
};

function channel(name: string) {
  return { channel: name, send: vi.fn(() => Promise.resolve()) } as Notifier & {
    send: ReturnType<typeof vi.fn>;
  };
}

function setup(memberRow: unknown = memberWithUser, chatId: string | null = null) {
  const notifier = channel('email');
  const members = {
    findOne: vi.fn(() => Promise.resolve(memberRow)),
  };
  const notifications = {
    create: vi.fn(() => Promise.resolve({ id: '99' })),
  };
  const telegramLinks = {
    chatIdOf: vi.fn(() => Promise.resolve(chatId)),
  };
  const service = new LoanNotificationService(
    members as unknown as Repository<Member>,
    notifications as unknown as NotificationsService,
    [notifier],
    telegramLinks as unknown as TelegramLinkService,
  );
  return { service, notifier, members, notifications, telegramLinks };
}

describe('LoanNotificationService', () => {
  it('sends a LOAN_APPROVED in-app notification and delivers via channels', async () => {
    const { service, notifications, notifier } = setup();
    service.onApproved(loan);
    // The dispatch is async (fire-and-forget), so flush
    await vi.waitFor(() => expect(notifications.create).toHaveBeenCalled());

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '7',
        type: 'LOAN_APPROVED',
        title: 'Loan approved',
      }),
    );
    expect(notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: expect.objectContaining({ userId: '7', email: 'student@example.com', name: 'Sok Dara' }),
        subject: 'Loan approved',
        icon: '✅',
      }),
    );
  });

  it('sends a LOAN_REJECTED in-app notification and delivers via channels', async () => {
    const { service, notifications, notifier } = setup();
    service.onRejected(loan);
    await vi.waitFor(() => expect(notifications.create).toHaveBeenCalled());

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '7',
        type: 'LOAN_REJECTED',
        title: 'Loan request declined',
      }),
    );
    expect(notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Loan request declined',
        icon: '❌',
      }),
    );
  });

  it('includes the loan code in the notification message', async () => {
    const { service, notifications } = setup();
    service.onApproved(loan);
    await vi.waitFor(() => expect(notifications.create).toHaveBeenCalled());

    const call = notifications.create.mock.calls[0][0] as { message: string };
    expect(call.message).toContain('LN-123');
  });

  it('looks up the Telegram chat for the member', async () => {
    const { service, telegramLinks, notifier } = setup(memberWithUser, '555');
    service.onApproved(loan);
    await vi.waitFor(() => expect(notifier.send).toHaveBeenCalled());

    expect(telegramLinks.chatIdOf).toHaveBeenCalledWith('7');
    expect(notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: expect.objectContaining({ telegramChatId: '555' }),
      }),
    );
  });

  it('does nothing when the member is not found', async () => {
    const { service, notifications, notifier } = setup(null);
    service.onApproved(loan);
    // Give the async dispatch time to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(notifications.create).not.toHaveBeenCalled();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('does not throw when a channel fails (fire-and-forget)', async () => {
    const { service, notifier } = setup();
    notifier.send.mockRejectedValue(new Error('SMTP down'));

    // Should not throw
    service.onApproved(loan);
    await new Promise((r) => setTimeout(r, 50));
  });
});
