import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { env } from '../env.js';

type ProviderResult = {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
};

type GeocodeItem = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  countryName: string | null;
  categoryCode: string;
  coordinates: { lat: number; lng: number };
};

const cache = new Map<string, { expiresAt: number; items: GeocodeItem[] }>();
let providerQueue: Promise<void> = Promise.resolve();
let nextProviderRequestAt = 0;

const category = (item: ProviderResult) => {
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
};

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

export const geocodingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/geocoding/search', { preHandler: requireUser }, async (request, reply) => {
    const query = z.object({
      query: z.string().trim().min(3).max(160),
      limit: z.coerce.number().min(1).max(8).default(7),
    }).parse(request.query);
    const cacheKey = `${query.query.toLocaleLowerCase('ru')}|${query.limit}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return { items: cached.items };

    const url = new URL(env.GEOCODING_URL);
    url.searchParams.set('q', query.query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'ru');
    url.searchParams.set('limit', String(query.limit));

    try {
      const items = await scheduleProviderRequest(async () => {
        const response = await fetch(url, {
          headers: { 'User-Agent': env.GEOCODING_USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`Geocoding ${response.status}`);
        const providerItems = await response.json() as ProviderResult[];
        return providerItems.map((item, index): GeocodeItem => {
          const address = item.address ?? {};
          const name = item.name ?? address.amenity ?? address.tourism ?? address.road ?? item.display_name.split(',')[0] ?? query.query;
          return {
            id: `geo-${index}-${item.lat}-${item.lon}`,
            name,
            address: item.display_name,
            city: address.city ?? address.town ?? address.village ?? address.municipality ?? null,
            countryName: address.country ?? null,
            categoryCode: category(item),
            coordinates: { lat: Number(item.lat), lng: Number(item.lon) },
          };
        });
      });
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { expiresAt: Date.now() + 24 * 60 * 60 * 1_000, items });
      return { items };
    } catch (error) {
      request.log.warn({ error }, 'geocoding unavailable');
      return reply.code(502).send({ code: 'GEOCODING_UNAVAILABLE', message: 'Поиск адреса временно недоступен. Выберите точку на карте.' });
    }
  });
};
