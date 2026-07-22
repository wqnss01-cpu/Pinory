import type { MapEntry } from '@pinory/shared';
import { api } from './api';

export interface GeneratedShareCard { blob: Blob; file: File; link: string }

const waitForImage = (image: HTMLImageElement) => new Promise<void>((resolve, reject) => {
  image.onload = () => resolve();
  image.onerror = () => reject(new Error('Не удалось загрузить изображение'));
});

async function loadImage(url: string) {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error('Фотография недоступна');
  const objectUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  image.src = objectUrl;
  try {
    if (typeof image.decode === 'function') await image.decode();
    else await waitForImage(image);
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function roundedClip(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.clip();
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

async function canvasToPng(canvas: HTMLCanvasElement) {
  if (canvas.toBlob) return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Не удалось собрать PNG-карточку')),
    'image/png',
  ));
  const [, base64] = canvas.toDataURL('image/png').split(',');
  if (!base64) throw new Error('Не удалось собрать PNG-карточку');
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

function safeFileName(placeName: string) {
  const slug = placeName.normalize('NFKD').replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `pinory-${slug || 'place'}.png`;
}

export async function generateEntryCard(entry: MapEntry): Promise<GeneratedShareCard> {
  const [linkData, me] = await Promise.all([api.telegramShareLink(`entry_${entry.id}`), api.me(), document.fonts?.ready ?? Promise.resolve()]);
  const link = linkData.url;
  const fromHome = me.homeCoordinates ? distanceKm(me.homeCoordinates, entry.place.coordinates) : null;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Создание изображений не поддерживается на этом устройстве');
  c.fillStyle = '#f7f1e5'; c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = '#173c34'; c.fillRect(0, 0, 1080, 96);
  c.fillStyle = '#fffdf8'; c.font = '700 34px Onest, sans-serif'; c.fillText('PINORY · ЖИВОЙ АТЛАС', 64, 62);
  c.save(); roundedClip(c, 56, 140, 968, 640, 44);
  if (entry.media[0]) {
    try {
      const image = await loadImage(entry.media[0].originalUrl);
      const scale = Math.max(968 / image.width, 640 / image.height);
      c.drawImage(image, (968 - image.width * scale) / 2 + 56, (640 - image.height * scale) / 2 + 140, image.width * scale, image.height * scale);
    } catch { c.fillStyle = '#d9e9df'; c.fillRect(56, 140, 968, 640); }
  } else {
    const gradient = c.createLinearGradient(56, 140, 1024, 780); gradient.addColorStop(0, '#ef6c56'); gradient.addColorStop(1, '#169a8f');
    c.fillStyle = gradient; c.fillRect(56, 140, 968, 640); c.fillStyle = 'rgba(255,255,255,.9)'; c.font = '700 84px Unbounded, sans-serif'; c.fillText(entry.place.name.slice(0, 18), 110, 460);
  }
  c.restore();
  c.fillStyle = '#173c34'; c.font = '700 58px Unbounded, sans-serif'; c.fillText(entry.place.name.length > 25 ? `${entry.place.name.slice(0, 24)}…` : entry.place.name, 64, 866);
  c.fillStyle = '#63736e'; c.font = '600 29px Onest, sans-serif'; c.fillText([entry.place.city, entry.place.countryName].filter(Boolean).join(' · ') || 'Место на карте', 66, 918);
  c.fillStyle = '#ef6c56'; c.font = '700 25px Onest, sans-serif'; c.fillText(entry.entryType === 'VISITED' ? 'Я здесь был' : 'Хочу побывать', 66, 973);
  if (entry.visitDate) { c.fillStyle = '#63736e'; c.fillText(new Date(entry.visitDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }), 280, 973); }
  if (fromHome !== null) { c.textAlign = 'right'; c.fillStyle = '#63736e'; c.fillText(`${fromHome} км от дома`, 800, 973); c.textAlign = 'left'; }
  if (entry.description) {
    c.fillStyle = '#173c34'; c.font = '500 26px Onest, sans-serif'; const words = entry.description.split(/\s+/); let line = ''; let y = 1035;
    for (const word of words) { const test = `${line}${word} `; if (c.measureText(test).width > 680) { c.fillText(line, 66, y); line = `${word} `; y += 38; if (y > 1148) break; } else line = test; }
    if (y <= 1148) c.fillText(line, 66, y);
  }
  const QR = (await import('qrcode')).default;
  const qrImage = new Image(); qrImage.src = await QR.toDataURL(link, { margin: 1, width: 180, color: { dark: '#173c34', light: '#fffdf8' } });
  if (typeof qrImage.decode === 'function') await qrImage.decode(); else await waitForImage(qrImage);
  c.drawImage(qrImage, 830, 1028, 180, 180); c.fillStyle = '#63736e'; c.font = '600 20px Onest, sans-serif'; c.fillText('Открыть место', 836, 1238);
  c.fillStyle = '#173c34'; c.font = '700 26px Onest, sans-serif'; c.fillText(`@${entry.author.displayName}`, 66, 1265); c.fillStyle = '#ef6c56'; c.fillRect(64, 1292, 952, 6);
  const blob = await canvasToPng(canvas); const file = new File([blob], safeFileName(entry.place.name), { type: 'image/png' }); return { blob, file, link };
}

export function downloadEntryCard(card: GeneratedShareCard) {
  const url = URL.createObjectURL(card.blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = card.file.name; anchor.rel = 'noopener'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function shareGeneratedEntryCard(card: GeneratedShareCard, placeName: string) {
  if (!navigator.share) throw new Error('Системное меню недоступно — нажмите «Скачать PNG»');
  const data: ShareData = { title: placeName, text: 'Моё место в Pinory', files: [card.file] };
  if (navigator.canShare && !navigator.canShare(data)) throw new Error('Это устройство не умеет делиться PNG — скачайте файл');
  await navigator.share(data);
}
