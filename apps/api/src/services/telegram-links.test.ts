import { describe, expect, it } from 'vitest';
import { buildStartMessage, buildTelegramBotLink, parseTelegramStartPayload } from './telegram-links.js';

describe('Telegram deep links', () => {
  it('opens a shared entry inside the Mini App', () => {
    expect(parseTelegramStartPayload('entry_a5591727-9a9f-42f8-9fcd-41cc0db9c0c2')).toMatchObject({
      appPath: '?entry=a5591727-9a9f-42f8-9fcd-41cc0db9c0c2',
      buttonLabel: 'Открыть место',
    });
  });

  it('preserves a valid referral parameter', () => {
    expect(parseTelegramStartPayload('ref_9faf84c0-f9e')).toMatchObject({
      appPath: '?ref=ref_9faf84c0-f9e',
      buttonLabel: 'Принять приглашение',
    });
  });

  it('rejects unsupported and oversized parameters', () => {
    expect(parseTelegramStartPayload('https://example.com')).toMatchObject({ appPath: '' });
    expect(() => buildTelegramBotLink('pinory_bot', `ref_${'a'.repeat(64)}`)).toThrow();
  });

  it('builds a bot link and includes the alpha notice in the welcome', () => {
    expect(buildTelegramBotLink('pinory_bot', 'ref_friend-1')).toBe('https://t.me/pinory_bot?start=ref_friend-1');
    expect(buildStartMessage()).toContain('Pinory — твой живой атлас мест.');
    expect(buildStartMessage()).toContain('Альфа-версия');
    expect(buildStartMessage()).toContain('Render');
  });
});
