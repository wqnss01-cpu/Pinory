export type TelegramStartTarget = {
  appPath: string;
  buttonLabel: string;
  intro: string;
};

const entryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const startParameterPattern = /^[A-Za-z0-9_-]{1,64}$/;

export const PINORY_GUIDE = `<b>Pinory — твой живой атлас мест.</b>

Сохраняй воспоминания, желания и находки друзей.

📍 Отмечай посещённые места и планы
🗺️ Собирай личную карту и подборки
👥 Следи за картами друзей
🏆 Открывай достижения за новые находки

Нажми кнопку ниже, чтобы открыть Pinory.

🧪 <b>Альфа-версия</b> размещена на бесплатных серверах Render. Первый запуск после паузы иногда занимает до минуты.`;

export function parseTelegramStartPayload(payload?: string): TelegramStartTarget {
  if (payload?.startsWith('entry_')) {
    const entryId = payload.slice('entry_'.length);
    if (entryIdPattern.test(entryId)) {
      return {
        appPath: `?entry=${encodeURIComponent(entryId)}`,
        buttonLabel: 'Открыть место',
        intro: '📍 Тебе поделились местом в Pinory.',
      };
    }
  }

  if (payload?.startsWith('ref_') && startParameterPattern.test(payload)) {
    return {
      appPath: `?ref=${encodeURIComponent(payload)}`,
      buttonLabel: 'Принять приглашение',
      intro: '👋 Друг приглашает тебя в Pinory — создавайте общую карту воспоминаний.',
    };
  }

  return { appPath: '', buttonLabel: 'Открыть Pinory', intro: '' };
}

export function buildStartMessage(payload?: string) {
  const target = parseTelegramStartPayload(payload);
  return target.intro ? `${target.intro}\n\n${PINORY_GUIDE}` : PINORY_GUIDE;
}

export function buildTelegramBotLink(username: string, start: string) {
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new Error('Telegram bot username is invalid');
  if (!startParameterPattern.test(start)) throw new Error('Telegram start parameter is invalid');
  return `https://t.me/${username}?start=${encodeURIComponent(start)}`;
}
