/// <reference types="vite/client" />

interface TelegramWebAppUser { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string; language_code?: string }
interface TelegramWebApp {
  initData: string; initDataUnsafe?: { user?: TelegramWebAppUser; start_param?: string }; colorScheme?: 'light' | 'dark'; themeParams?: Record<string, string>;
  ready(): void; expand(): void; close(): void; openTelegramLink(url: string): void;
  onEvent?(event: string, callback: () => void): void; offEvent?(event: string, callback: () => void): void;
  showPopup?(params: unknown, callback?: (id?: string) => void): void;
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
  BackButton?: { show(): void; hide(): void; onClick(callback: () => void): void; offClick(callback: () => void): void };
  MainButton?: { setText(text: string): void; show(): void; hide(): void; onClick(callback: () => void): void; offClick(callback: () => void): void };
  LocationManager?: { init(callback: () => void): void; isInited?: boolean; isLocationAvailable?: boolean; getLocation(callback: (location: { latitude: number; longitude: number } | null) => void): void };
}
interface Window { Telegram?: { WebApp: TelegramWebApp } }
