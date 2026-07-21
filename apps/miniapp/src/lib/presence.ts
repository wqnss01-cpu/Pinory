export function formatPresence(recordedAt: string, isLive: boolean) {
  if (isLive) return 'Гуляет здесь прямо сейчас';
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(recordedAt).getTime()) / 60_000));
  if (minutes < 60) return `Был здесь ${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Был здесь ${hours} ч назад`;
  return `Был здесь ${Math.floor(hours / 24)} дн назад`;
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earth = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
