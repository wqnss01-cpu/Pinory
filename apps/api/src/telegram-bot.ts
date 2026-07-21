import type { FastifyInstance } from 'fastify';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { env } from './env.js';

function withTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

export async function registerTelegramBot(app: FastifyInstance) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_MINI_APP_URL) return;

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const appUrl = env.TELEGRAM_MINI_APP_URL.replace(/\/$/, '');
  const openKeyboard = (path = '') => new InlineKeyboard().webApp('Открыть Pinory', `${appUrl}${path}`);

  bot.command('start', async (context) => {
    const referral = context.match ? `?ref=${encodeURIComponent(context.match)}` : '';
    await context.reply(
      'Pinory — твой живой атлас мест. Сохраняй воспоминания, желания и находки друзей.',
      { reply_markup: openKeyboard(referral) },
    );
  });
  bot.command('map', (context) => context.reply('Открываю твою карту 🗺️', { reply_markup: openKeyboard('/') }));
  bot.command('profile', (context) => context.reply('Открываю твой профиль Pinory', { reply_markup: openKeyboard('/') }));
  bot.command('help', (context) => context.reply('Открой Pinory кнопкой ниже. На карте можно сохранять посещённые места и желания, создавать подборки и подписываться на друзей.', { reply_markup: openKeyboard('/') }));
  bot.command('location', (context) => context.reply('Pinory определяет позицию только внутри открытого Mini App и только после твоего разрешения.'));
  bot.command('stoplocation', (context) => context.reply('Фоновое отслеживание не ведётся.'));
  bot.catch((error) => app.log.error({ error: error.error }, 'Telegram bot update failed'));

  const handler = webhookCallback(bot, 'fastify', {
    onTimeout: 'return',
    timeoutMilliseconds: 9_000,
    ...(env.TELEGRAM_WEBHOOK_SECRET ? { secretToken: env.TELEGRAM_WEBHOOK_SECRET } : {}),
  });
  app.post('/telegram/webhook', { config: { rateLimit: false } }, handler);

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
