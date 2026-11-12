import type { ConfigService } from '@nestjs/config';
import {
  formatTelegramMessage,
  TelegramApiError,
  TelegramNotifier,
} from './telegram-notifier';
import { telegramConfigFrom } from './telegram.config';

const config = (env: Record<string, string>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

const TOKEN = '123456:secret-token';

// A fake Bot API: answers each call with the given body
function api(body: object = { ok: true, result: true }) {
  return vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(body),
    } as Response),
  );
}

const sent = (http: ReturnType<typeof api>, call = 0) => ({
  url: http.mock.calls[call][0],
  body: JSON.parse(http.mock.calls[call][1].body as string) as Record<
    string,
    unknown
  >,
});

const recipient = { userId: '7', email: 'a@b.test', name: 'Sok Dara' };

describe('telegramConfigFrom', () => {
  it('is off without TELEGRAM_BOT_TOKEN', () => {
    expect(telegramConfigFrom(config({}))).toEqual({
      botToken: null,
      polling: false,
    });
  });

  it('polls by default once the token is set, unless TELEGRAM_POLLING=off', () => {
    expect(telegramConfigFrom(config({ TELEGRAM_BOT_TOKEN: TOKEN }))).toEqual({
      botToken: TOKEN,
      polling: true,
    });
    expect(
      telegramConfigFrom(
        config({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_POLLING: 'off' }),
      ).polling,
    ).toBe(false);
  });
});

describe('TelegramNotifier', () => {
  const on = { botToken: TOKEN, polling: false };

  it('sends the reminder to the linked chat, formatted', async () => {
    const http = api();
    await new TelegramNotifier(on, http).send({
      to: { ...recipient, telegramChatId: '555' },
      subject: 'Your book is overdue',
      text: '"Clean Code" was due on Mon, 9 Nov 2026.',
      icon: '⚠️',
    });
    expect(sent(http)).toEqual({
      url: `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      body: {
        chat_id: '555',
        text:
          '⚠️ <b>Your book is overdue</b>\n\n' +
          'Hi Sok Dara,\n\n' +
          '"Clean Code" was due on Mon, 9 Nov 2026.\n\n' +
          '<i>— LibraFlow Library</i>',
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
    });
  });

  it('escapes book titles and names, so they cannot break the formatting', () => {
    expect(
      formatTelegramMessage({
        to: { ...recipient, name: 'Tom & <Jerry>' },
        subject: 'Due <soon>',
        text: '"C++ & <Templates>"',
      }),
    ).toBe(
      '<b>Due &lt;soon&gt;</b>\n\n' +
        'Hi Tom &amp; &lt;Jerry&gt;,\n\n' +
        '"C++ &amp; &lt;Templates&gt;"\n\n' +
        '<i>— LibraFlow Library</i>',
    );
  });

  it('skips users who have not linked Telegram', async () => {
    const http = api();
    await new TelegramNotifier(on, http).send({
      to: recipient,
      subject: 's',
      text: 't',
    });
    expect(http).not.toHaveBeenCalled();
  });

  it.each([403, 400])(
    'skips without retrying when the chat is unreachable (%i)',
    async (code) => {
      const http = api({
        ok: false,
        error_code: code,
        description: 'Forbidden: bot was blocked by the user',
      });
      await expect(
        new TelegramNotifier(on, http).send({
          to: { ...recipient, telegramChatId: '555' },
          subject: 's',
          text: 't',
        }),
      ).resolves.toBeUndefined();
    },
  );

  it('throws on other errors so the job is retried, without the token in the message', async () => {
    const http = api({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests',
    });
    const error = await new TelegramNotifier(on, http)
      .send({
        to: { ...recipient, telegramChatId: '555' },
        subject: 's',
        text: 't',
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TelegramApiError);
    expect((error as Error).message).toBe(
      'Telegram API error 429: Too Many Requests',
    );
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('asks Telegram for the bot username once', async () => {
    const http = api({ ok: true, result: { username: 'LibraFlowBot' } });
    const telegram = new TelegramNotifier(on, http);
    await expect(telegram.botUsername()).resolves.toBe('LibraFlowBot');
    await expect(telegram.botUsername()).resolves.toBe('LibraFlowBot');
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('is not configured, and never calls Telegram, without a token', async () => {
    const http = api();
    const telegram = new TelegramNotifier(
      { botToken: null, polling: false },
      http,
    );
    expect(telegram.configured).toBe(false);
    await expect(telegram.sendHtml('555', 'hi')).rejects.toThrow(
      'TELEGRAM_BOT_TOKEN is not set',
    );
    expect(http).not.toHaveBeenCalled();
  });
});
