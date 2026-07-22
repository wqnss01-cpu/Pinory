import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { User } from '@pinory/shared';
import { apiBase, authenticateMobileGrant } from './api';

export const isNativeApp = Capacitor.isNativePlatform();

const authErrors: Record<string, string> = {
  expired: 'Ссылка входа устарела. Попробуйте ещё раз.',
  cancelled: 'Вход отменён.',
  login_failed: 'Telegram не подтвердил вход. Попробуйте ещё раз.',
};

export async function beginNativeTelegramLogin() {
  const url = new URL(`${apiBase}/auth/telegram/oidc/start`);
  url.searchParams.set('platform', 'android');
  await Browser.open({ url: url.toString() });
}

export async function listenForNativeTelegramAuth(callbacks: {
  onSuccess: (user: User) => void;
  onError: (message: string) => void;
}) {
  if (!isNativeApp) return () => undefined;
  let processing = false;
  const handleUrl = async (rawUrl?: string) => {
    if (!rawUrl || processing) return;
    const url = new URL(rawUrl);
    if (url.protocol !== 'pinory:' || url.host !== 'auth') return;
    processing = true;
    await Browser.close().catch(() => undefined);
    try {
      const grant = url.searchParams.get('grant');
      if (!grant) throw new Error(authErrors[url.searchParams.get('error') ?? ''] ?? 'Не удалось войти через Telegram.');
      callbacks.onSuccess(await authenticateMobileGrant(grant));
    } catch (error) {
      callbacks.onError((error as Error).message);
    } finally {
      processing = false;
    }
  };
  const listener = await CapacitorApp.addListener('appUrlOpen', ({ url }) => { void handleUrl(url); });
  const launch = await CapacitorApp.getLaunchUrl();
  await handleUrl(launch?.url);
  return () => { void listener.remove(); };
}
