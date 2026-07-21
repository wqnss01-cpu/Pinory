import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = (process.env.TELEGRAM_MINI_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const bot = new Bot(token);
const openKeyboard = (path = '', label = 'Открыть Pinory') => new InlineKeyboard().webApp(label, `${appUrl}${path}`);
const guide = `<b>Pinory — твой живой атлас мест.</b>

Сохраняй воспоминания, желания и находки друзей.

📍 Отмечай посещённые места и планы
🗺️ Собирай личную карту и подборки
👥 Следи за картами друзей
🏆 Открывай достижения за новые находки

Нажми кнопку ниже, чтобы открыть Pinory.

🧪 <b>Альфа-версия</b> размещена на бесплатных серверах Render. Первый запуск после паузы иногда занимает до минуты.`;

function startTarget(payload: string) {
  const entry = payload.match(/^entry_([0-9a-f-]{36})$/i)?.[1];
  if (entry) return { path: `?entry=${encodeURIComponent(entry)}`, label: 'Открыть место', intro: '📍 Тебе поделились местом в Pinory.' };
  if (/^ref_[A-Za-z0-9_-]{1,60}$/.test(payload)) return { path: `?ref=${encodeURIComponent(payload)}`, label: 'Принять приглашение', intro: '👋 Друг приглашает тебя в Pinory — создавайте общую карту воспоминаний.' };
  return { path: '', label: 'Открыть Pinory', intro: '' };
}

bot.command('start', async (context) => {
  const payload = typeof context.match === 'string' ? context.match.trim() : '';
  const target = startTarget(payload);
  await context.reply(target.intro ? `${target.intro}\n\n${guide}` : guide, {
    parse_mode: 'HTML',
    reply_markup: openKeyboard(target.path, target.label),
  });
});
bot.command('map', (context) => context.reply('Открываю твою карту 🗺️', { reply_markup: openKeyboard('/') }));
bot.command('profile', (context) => context.reply('Открываю твой профиль Pinory', { reply_markup: openKeyboard('/') }));
bot.command('help', (context) => context.reply(guide, { parse_mode: 'HTML', reply_markup: openKeyboard('/') }));
bot.command('location', (context) => context.reply('Pinory определяет позицию только внутри открытого Mini App и только после твоего разрешения.'));
bot.command('stoplocation', (context) => context.reply('Фоновое отслеживание не ведётся.'));
bot.catch((error) => console.error('Pinory bot error', error));
bot.start({ onStart: () => console.log('Pinory bot started') });
