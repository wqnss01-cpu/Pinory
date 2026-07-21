import type { FastifyInstance } from 'fastify';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { env } from './env.js';
import { buildStartMessage, buildTelegramBotLink, parseTelegramStartPayload, PINORY_GUIDE } from './services/telegram-links.js';

function withTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

export async function registerTelegramBot(app: FastifyInstance) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_MINI_APP_URL) return;

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const appUrl = env.TELEGRAM_MINI_APP_URL.replace(/\/$/, '');
  const openKeyboard = (path = '', label = 'Открыть Pinory') => new InlineKeyboard().webApp(label, `${appUrl}${path}`);
  let botUsername: string | undefined;

  const getBotUsername = async () => {
    if (botUsername) return botUsername;
    const info = await bot.api.getMe();
    botUsername = info.username;
    return botUsername;
  };

  bot.command('start', async (context) => {
    const payload = typeof context.match === 'string' ? context.match.trim() : '';
    const target = parseTelegramStartPayload(payload);
    await context.reply(buildStartMessage(payload), {
      parse_mode: 'HTML',
      reply_markup: openKeyboard(target.appPath, target.buttonLabel),
    });
  });
  bot.command('map', (context) => context.reply('Открываю твою карту 🗺️', { reply_markup: openKeyboard('/') }));
  bot.command('profile', (context) => context.reply('Открываю твой профиль Pinory', { reply_markup: openKeyboard('/') }));
  bot.command('help', (context) => context.reply(PINORY_GUIDE, { parse_mode: 'HTML', reply_markup: openKeyboard('/') }));
  bot.command('location', (context) => context.reply('Pinory определяет позицию только внутри открытого Mini App и только после твоего разрешения.'));
  bot.command('stoplocation', (context) => context.reply('Фоновое отслеживание не ведётся.'));
  bot.catch((error) => app.log.error({ error: error.error }, 'Telegram bot update failed'));

  const handler = webhookCallback(bot, 'fastify', {
    onTimeout: 'return',
    timeoutMilliseconds: 9_000,
    ...(env.TELEGRAM_WEBHOOK_SECRET ? { secretToken: env.TELEGRAM_WEBHOOK_SECRET } : {}),
  });
  app.post('/telegram/webhook', { config: { rateLimit: false } }, handler);
  app.get('/telegram/share-link', { preHandler: requireUser }, async (request) => {
    const { start } = z.object({ start: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).parse(request.query);
    return { url: buildTelegramBotLink(await getBotUsername(), start) };
  });

  app.addHook('onReady', async () => {
    if (!env.PUBLIC_API_URL || !env.TELEGRAM_WEBHOOK_SECRET) return;
    const webhookUrl = new URL('telegram/webhook', withTrailingSlash(env.PUBLIC_API_URL)).toString();
    try {
      await bot.api.setWebhook(webhookUrl, {
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message'],
      });
      await bot.api.setMyCommands([
        { command: 'start', description: 'Открыть Pinory' },
        { command: 'map', description: 'Открыть карту' },
        { command: 'profile', description: 'Открыть профиль' },
        { command: 'help', description: 'Как пользоваться Pinory' },
      ]);
      await bot.api.setChatMenuButton({
        menu_button: { type: 'web_app', text: 'Открыть Pinory', web_app: { url: appUrl } },
      });
      app.log.info({ webhookUrl }, 'Telegram webhook and menu button configured');
    } catch (error) {
      app.log.error({ error }, 'Telegram webhook configuration failed');
    }
  });
}
