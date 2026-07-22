import { env } from '../env.js';

export type Coordinates = { lat: number; lng: number };

export type ProviderResult = {
  place_id?: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
};

export type Geography = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  region: string | null;
  countryName: string | null;
  countryCode: string | null;
  categoryCode: string;
  coordinates: Coordinates;
};

const searchCache = new Map<string, { expiresAt: number; items: Geography[] }>();
const reverseCache = new Map<string, { expiresAt: number; item: Geography }>();
let providerQueue: Promise<void> = Promise.resolve();
let nextProviderRequestAt = 0;

export function categoryFromProvider(item: ProviderResult) {
  const value = `${item.class ?? ''} ${item.type ?? ''}`;
  if (/cafe|coffee/.test(value)) return 'cafe';
  if (/restaurant|food/.test(value)) return 'restaurant';
  if (/museum|gallery/.test(value)) return 'museum';
  if (/park|garden|nature/.test(value)) return 'nature';
  if (/hotel|hostel/.test(value)) return 'hotel';
  if (/beach/.test(value)) return 'beach';
  if (/mountain|peak/.test(value)) return 'mountain';
  if (/viewpoint/.test(value)) return 'viewpoint';
  if (/historic|castle|monument|building/.test(value)) return 'architecture';
  return 'other';
}

export function localityFromAddress(address: Record<string, string>) {
  return address.city
    ?? address.town
    ?? address.village
    ?? address.municipality
    ?? address.hamlet
    ?? address.locality
    ?? null;
}

export function geographyFromProvider(item: ProviderResult, fallbackName = 'Точка на карте', index = 0): Geography {
  const address = item.address ?? {};
  const rawName = item.name
    ?? address.amenity
    ?? address.tourism
    ?? address.building
    ?? address.road
    ?? localityFromAddress(address)
    ?? item.display_name.split(',')[0]
    ?? fallbackName;
  const name = rawName.trim().length >= 2 ? rawName.trim().slice(0, 120) : fallbackName;
  return {
    id: `geo-${item.place_id ?? index}-${item.lat}-${item.lon}`,
    name,
    address: item.display_name.slice(0, 500),
    city: localityFromAddress(address),
    region: address.state ?? address.region ?? address.province ?? null,
    countryName: address.country ?? null,
    countryCode: address.country_code?.toUpperCase() ?? null,
    categoryCode: categoryFromProvider(item),
    coordinates: { lat: Number(item.lat), lng: Number(item.lon) },
  };
}

function trimCache<T>(cache: Map<string, T>) {
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
}

function scheduleProviderRequest<T>(task: () => Promise<T>): Promise<T> {
  const result = providerQueue.then(async () => {
    const delay = Math.max(0, nextProviderRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextProviderRequestAt = Date.now() + 1_050;
    return task();
  });
  providerQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function fetchProvider<T>(url: URL): Promise<T> {
  return scheduleProviderRequest(async () => {
    const response = await fetch(url, {
      headers: { 'User-Agent': env.GEOCODING_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Geocoding ${response.status}`);
    return response.json() as Promise<T>;
  });
}

function providerUrl(kind: 'search' | 'reverse') {
  const url = new URL(env.GEOCODING_URL);
  url.pathname = url.pathname.replace(/\/(search|reverse)\/?$/, `/${kind}`);
  return url;
}

export async function searchGeography(query: string, limit: number) {
  const key = `${query.toLocaleLowerCase('ru')}|${limit}`;
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  const url = providerUrl('search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'ru');
  url.searchParams.set('limit', String(limit));
  const providerItems = await fetchProvider<ProviderResult[]>(url);
  const items = providerItems.map((item, index) => geographyFromProvider(item, query, index));
  trimCache(searchCache);
  searchCache.set(key, { expiresAt: Date.now() + 24 * 60 * 60 * 1_000, items });
  return items;
}

export async function reverseGeography(coordinates: Coordinates) {
  const key = `${coordinates.lat.toFixed(5)},${coordinates.lng.toFixed(5)}`;
  const cached = reverseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.item;
  const url = providerUrl('reverse');
  url.searchParams.set('lat', String(coordinates.lat));
  url.searchParams.set('lon', String(coordinates.lng));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'ru');
  url.searchParams.set('zoom', '18');
  const result = await fetchProvider<ProviderResult>(url);
  const item = geographyFromProvider(result);
  trimCache(reverseCache);
  reverseCache.set(key, { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1_000, item });
  return item;
}
