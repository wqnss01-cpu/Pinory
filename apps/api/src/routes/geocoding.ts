import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { pool } from '../db.js';
import { reverseGeography, searchGeography } from '../services/geography.js';

const coordinatesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const geocodingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/geocoding/search', { preHandler: requireUser }, async (request, reply) => {
    const query = z.object({
      query: z.string().trim().min(3).max(160),
      limit: z.coerce.number().min(1).max(8).default(7),
    }).parse(request.query);
    try {
      return { items: await searchGeography(query.query, query.limit) };
    } catch (error) {
      request.log.warn({ error }, 'geocoding unavailable');
      return reply.code(502).send({ code: 'GEOCODING_UNAVAILABLE', message: 'Поиск адреса временно недоступен. Выберите точку на карте.' });
    }
  });

  app.get('/geocoding/reverse', { preHandler: requireUser }, async (request, reply) => {
    const coordinates = coordinatesSchema.parse(request.query);
    try {
      return { item: await reverseGeography(coordinates) };
    } catch (error) {
      request.log.warn({ error, coordinates }, 'reverse geocoding unavailable');
      return reply.code(502).send({ code: 'GEOCODING_UNAVAILABLE', message: 'Не удалось уточнить город и страну. Попробуйте ещё раз.' });
    }
  });

  app.post('/geocoding/refresh-my-places', { preHandler: requireUser, config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (request, reply) => {
    const candidates = await pool.query(`SELECT DISTINCT p.id,ST_Y(p.location::geometry) lat,ST_X(p.location::geometry) lng
      FROM places p JOIN map_entries e ON e.place_id=p.id
      WHERE e.user_id=$1 AND e.entry_type='VISITED' AND e.deleted_at IS NULL
        AND (p.geography_checked_at IS NULL OR p.country_code IS NULL)
      ORDER BY p.id LIMIT 5`, [request.user.sub]);
    let refreshed = 0;
    for (const row of candidates.rows) {
      try {
        const geo = await reverseGeography({ lat: Number(row.lat), lng: Number(row.lng) });
        await pool.query(`UPDATE places SET city=$2,region=$3,country_name=$4,country_code=$5,address=COALESCE(address,$6),
          geography_checked_at=now() WHERE id=$1`, [row.id, geo.city, geo.region, geo.countryName, geo.countryCode, geo.address]);
        refreshed += 1;
      } catch (error) {
        request.log.warn({ error, placeId: row.id }, 'place geography refresh failed');
      }
    }
    const remaining = await pool.query(`SELECT count(DISTINCT p.id)::int count FROM places p JOIN map_entries e ON e.place_id=p.id
      WHERE e.user_id=$1 AND e.entry_type='VISITED' AND e.deleted_at IS NULL
        AND (p.geography_checked_at IS NULL OR p.country_code IS NULL)`, [request.user.sub]);
    return reply.send({ refreshed, remaining: Number(remaining.rows[0].count) });
  });
};
