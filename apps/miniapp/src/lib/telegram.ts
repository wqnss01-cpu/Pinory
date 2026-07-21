type Theme = 'light' | 'dark';
export interface TelegramAdapter { initData: string; user?: TelegramWebAppUser; theme: Theme; startParam?: string; ready(): void; haptic(type?: 'light' | 'medium' | 'success' | 'error'): void; share(url: string, text: string): void; location(): Promise<{ lat: number; lng: number; accuracy?: number }>; onThemeChange(callback: (theme: Theme) => void): () => void }

export function createTelegramAdapter(): TelegramAdapter {
  const webApp = window.Telegram?.WebApp;
  const currentTheme = (): Theme => webApp?.colorScheme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  return {
    initData: webApp?.initData ?? '', user: webApp?.initDataUnsafe?.user, theme: currentTheme(), startParam: webApp?.initDataUnsafe?.start_param,
    ready() { webApp?.ready(); webApp?.expand(); },
    haptic(type = 'light') { if (type === 'success' || type === 'error') webApp?.HapticFeedback?.notificationOccurred(type); else webApp?.HapticFeedback?.impactOccurred(type); },
    share(url, text) { const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`; if (webApp) webApp.openTelegramLink(link); else window.open(link, '_blank', 'noopener,noreferrer'); },
    location() { return new Promise((resolve, reject) => { const fallback = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition((position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }), reject, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 }) : reject(new Error('Геолокация недоступна')); if (webApp?.LocationManager) webApp.LocationManager.init(() => webApp.LocationManager!.getLocation((location) => location ? resolve({ lat: location.latitude, lng: location.longitude }) : fallback())); else fallback(); }); },
    onThemeChange(callback) {
      if (webApp?.onEvent && webApp.offEvent) {
        const handler = () => callback(currentTheme()); webApp.onEvent('themeChanged', handler); return () => webApp.offEvent?.('themeChanged', handler);
      }
      const media = matchMedia('(prefers-color-scheme: dark)'); const handler = () => callback(media.matches ? 'dark' : 'light'); media.addEventListener('change', handler); return () => media.removeEventListener('change', handler);
    },
  };
}
export const telegram = createTelegramAdapter();
