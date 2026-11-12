import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TelegramNotifier } from '../src/notifications/channels/telegram-notifier';
import { OVERDUE_QUEUE } from '../src/notifications/overdue/overdue.constants';
import {
  BOT_REPLIES,
  TelegramLinkService,
} from '../src/notifications/telegram/telegram-link.service';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

const CHAT_ID = 555;

describe('Telegram reminders (e2e)', () => {
  describe('without a bot configured (TELEGRAM_BOT_TOKEN empty)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createTestApp();
    });
    afterAll(async () => {
      await app?.close();
    });

    it('needs a login', async () => {
      await request(app.getHttpServer()).post('/api/v1/notifications/telegram/link').expect(401);
    });

    it('says Telegram is not set up', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/notifications/telegram/link')
        .set(as(USERS.member))
        .expect(503);
    });

    it('reports not linked', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/telegram')
        .set(as(USERS.member))
        .expect(200);
      expect(res.body).toEqual({ linked: false });
    });
  });

  // The real app with a fake Bot API: every call is recorded, none leaves
  describe('with a bot', () => {
    let app: INestApplication<App>;
    let calls: Array<{ method: string; body: Record<string, unknown> }>;

    beforeAll(async () => {
      calls = [];
      const http = (url: string, init: RequestInit) => {
        const method = url.split('/').pop()!;
        calls.push({ method, body: JSON.parse(init.body as string) as Record<string, unknown> });
        const result = method === 'getMe' ? { username: 'LibraFlowTestBot' } : true;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ ok: true, result }),
        } as Response);
      };
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(TelegramNotifier)
        .useValue(new TelegramNotifier({ botToken: '123:fake', polling: false }, http))
        .compile();
      app = configureApp(
        moduleRef.createNestApplication<INestApplication<App>>({ logger: false }),
      );
      await app.init();
      await app.get<Queue>(getQueueToken(OVERDUE_QUEUE)).obliterate({ force: true });
    });

    afterAll(async () => {
      // Leave the shared database and queue as other specs expect them
      const db = app.get(DataSource);
      await db.query(`DELETE FROM telegram_links`);
      await db.query(
        `DELETE FROM notifications WHERE type IN ('LOAN_OVERDUE', 'LOAN_DUE_SOON', 'LOAN_DUE_TODAY')`,
      );
      await app.get<Queue>(getQueueToken(OVERDUE_QUEUE)).obliterate({ force: true });
      await app.close();
    });

    const sentTo = (chatId: number) =>
      calls.filter(
        (c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(chatId),
      );

    it('links the account when the user presses Start on the link', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/telegram/link')
        .set(as(USERS.member))
        .expect(201);
      const token = /^https:\/\/t\.me\/LibraFlowTestBot\?start=([\w-]+)$/.exec(
        res.body.url as string,
      )?.[1];
      expect(token).toBeDefined();

      // What the poller does when Telegram delivers "/start <token>"
      await app.get(TelegramLinkService).handleUpdate({
        update_id: 1,
        message: { chat: { id: CHAT_ID, type: 'private' }, text: `/start ${token}` },
      });
      expect(sentTo(CHAT_ID).at(-1)?.body.text).toBe(BOT_REPLIES.linked);

      const status = await request(app.getHttpServer())
        .get('/api/v1/notifications/telegram')
        .set(as(USERS.member))
        .expect(200);
      expect(status.body).toEqual({ linked: true });

      // The token works once
      await app.get(TelegramLinkService).handleUpdate({
        update_id: 2,
        message: { chat: { id: CHAT_ID, type: 'private' }, text: `/start ${token}` },
      });
      expect(sentTo(CHAT_ID).at(-1)?.body.text).toBe(BOT_REPLIES.invalidLink);
    });

    it('sends the overdue and due-tomorrow reminders to the linked chat', async () => {
      const before = sentTo(CHAT_ID).length;
      await request(app.getHttpServer())
        .post('/api/v1/notifications/overdue/scan')
        .set(as(USERS.librarian))
        .expect(200);

      const reminders = await vi.waitFor(
        () => {
          const found = sentTo(CHAT_ID).slice(before);
          if (found.length < 2) throw new Error('not processed yet');
          return found.map((c) => String(c.body.text));
        },
        { timeout: 10_000, interval: 200 },
      );
      expect(reminders.sort()).toEqual([
        expect.stringMatching(/^⚠️ <b>Your book is overdue<\/b>\n\nHi .+,\n\n.+ was due on /),
        expect.stringMatching(/^📚 <b>Your book is due tomorrow<\/b>\n\nHi .+,\n\nFriendly reminder: /),
      ]);
    }, 15_000);

    it('stops when the user unlinks', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/notifications/telegram')
        .set(as(USERS.member))
        .expect(204);
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/telegram')
        .set(as(USERS.member))
        .expect(200);
      expect(res.body).toEqual({ linked: false });
    });
  });
});
