import { afterEach, describe, expect, it, vi } from 'vitest';
import { distanceMeters, formatPresence } from './presence';

describe('friend presence', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a live label for a fresh active sample', () => {
    expect(formatPresence(new Date().toISOString(), true)).toBe('Гуляет здесь прямо сейчас');
  });

  it('formats an older sample in hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
    expect(formatPresence('2026-07-22T09:20:00Z', false)).toBe('Был здесь 2 ч назад');
  });

  it('calculates short geographic distances', () => {
    const distance = distanceMeters({ lat: 55.7512, lng: 37.6184 }, { lat: 55.7521, lng: 37.6184 });
    expect(distance).toBeGreaterThan(95);
    expect(distance).toBeLessThan(105);
  });
});
