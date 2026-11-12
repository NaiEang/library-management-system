import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Repository } from 'typeorm';
import type {
  TelegramNotifier,
  TelegramUpdate,
} from '../channels/telegram-notifier';
import type { TelegramLink } from '../entities/telegram-link.entity';
import {
  BOT_REPLIES,
  TelegramLinkService,
  UNREACHABLE,
} from './telegram-link.service';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const NOW = new Date('2026-11-12T08:00:00Z');

function setup({
  configured = true,
  pending = null as Partial<TelegramLink> | null,
} = {}) {
  const txRepo = {
    findOne: vi.fn(() => Promise.resolve(pending)),
    update: vi.fn(() => Promise.resolve({ affected: 1 })),
  };
  const links = {
    upsert: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve({ affected: 1 })),
    findOne: vi.fn(() => Promise.resolve(null as Partial<TelegramLink> | null)),
    manager: {
      transaction: (work: (m: unknown) => Promise<unknown>) =>
        work({ getRepository: () => txRepo }),
    },
  };
  const telegram = {
    configured,
    botUsername: vi.fn(() => Promise.resolve('LibraFlowBot')),
    sendHtml: vi.fn(() => Promise.resolve()),
  };
  const service = new TelegramLinkService(
    links as unknown as Repository<TelegramLink>,
    telegram as unknown as TelegramNotifier,
  );
  return { service, links, txRepo, telegram };
}

const message = (text: string, type = 'private'): TelegramUpdate => ({
  update_id: 1,
  message: { chat: { id: 555, type }, text },
});

describe('TelegramLinkService.createLink', () => {
  it('returns a one-time t.me link and stores only the token hash', async () => {
    const { service, links } = setup();
    const { url, expiresAt } = await service.createLink('7', NOW);

    const token =
      /^https:\/\/t\.me\/LibraFlowBot\?start=([A-Za-z0-9_-]{32})$/.exec(
        url,
      )?.[1];
    expect(token).toBeDefined();
    expect(expiresAt).toEqual(new Date('2026-11-12T08:15:00Z'));
    expect(links.upsert).toHaveBeenCalledWith(
      {
        userId: '7',
        linkTokenHash: sha256(token!),
        linkTokenExpiresAt: expiresAt,
      },
      ['userId'],
    );
  });

  it('answers 503, not 500, when Telegram cannot be reached', async () => {
    const { service, links, telegram } = setup();
    telegram.botUsername.mockRejectedValueOnce(new TypeError('fetch failed'));
    const error = await service.createLink('7', NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).toBe(UNREACHABLE);
    expect(links.upsert).not.toHaveBeenCalled();
  });

  it('is unavailable when no bot is configured', async () => {
    const { service, links } = setup({ configured: false });
    await expect(service.createLink('7', NOW)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(links.upsert).not.toHaveBeenCalled();
  });
});

describe('TelegramLinkService.handleUpdate', () => {
  it('links the chat for a valid /start token and clears the token', async () => {
    const { service, txRepo, telegram } = setup({ pending: { userId: '7' } });
    await service.handleUpdate(message('/start abc123'), NOW);

    expect(txRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          linkTokenHash: sha256('abc123'),
        }) as unknown,
      }),
    );
    // The chat leaves any other account first, then joins this one
    expect(txRepo.update).toHaveBeenNthCalledWith(
      1,
      { chatId: '555' },
      { chatId: null, linkedAt: null },
    );
    expect(txRepo.update).toHaveBeenNthCalledWith(
      2,
      { userId: '7' },
      {
        chatId: '555',
        linkedAt: NOW,
        linkTokenHash: null,
        linkTokenExpiresAt: null,
      },
    );
    expect(telegram.sendHtml).toHaveBeenCalledWith('555', BOT_REPLIES.linked);
  });

  it('accepts /start@BotName <token> too', async () => {
    const { service, telegram } = setup({ pending: { userId: '7' } });
    await service.handleUpdate(message('/start@LibraFlowBot abc123'), NOW);
    expect(telegram.sendHtml).toHaveBeenCalledWith('555', BOT_REPLIES.linked);
  });

  it('refuses an unknown, used or expired token', async () => {
    const { service, txRepo, telegram } = setup({ pending: null });
    await service.handleUpdate(message('/start nope'), NOW);
    expect(txRepo.update).not.toHaveBeenCalled();
    expect(telegram.sendHtml).toHaveBeenCalledWith(
      '555',
      BOT_REPLIES.invalidLink,
    );
  });

  it('explains how to link on a plain /start', async () => {
    const { service, txRepo, telegram } = setup();
    await service.handleUpdate(message('/start'), NOW);
    expect(txRepo.findOne).not.toHaveBeenCalled();
    expect(telegram.sendHtml).toHaveBeenCalledWith('555', BOT_REPLIES.noLink);
  });

  it('unlinks on /stop', async () => {
    const { service, links, telegram } = setup();
    await service.handleUpdate(message('/stop'), NOW);
    expect(links.update).toHaveBeenCalledWith(
      { chatId: '555' },
      { chatId: null, linkedAt: null },
    );
    expect(telegram.sendHtml).toHaveBeenCalledWith('555', BOT_REPLIES.unlinked);
  });

  it('unlinks when the user blocks the bot', async () => {
    const { service, links, telegram } = setup();
    await service.handleUpdate({
      update_id: 2,
      my_chat_member: {
        chat: { id: 555, type: 'private' },
        new_chat_member: { status: 'kicked' },
      },
    });
    expect(links.update).toHaveBeenCalledWith(
      { chatId: '555' },
      { chatId: null, linkedAt: null },
    );
    expect(telegram.sendHtml).not.toHaveBeenCalled();
  });

  it('ignores groups, so reminders never go to a shared chat', async () => {
    const { service, txRepo, telegram } = setup({ pending: { userId: '7' } });
    await service.handleUpdate(message('/start abc123', 'group'), NOW);
    expect(txRepo.findOne).not.toHaveBeenCalled();
    expect(telegram.sendHtml).not.toHaveBeenCalled();
  });

  it('ignores other messages', async () => {
    const { service, telegram } = setup();
    await service.handleUpdate(message('hello'), NOW);
    expect(telegram.sendHtml).not.toHaveBeenCalled();
  });
});
