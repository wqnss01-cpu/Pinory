import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { pool, tx } from '../db.js';

const locationInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().positive().max(10_000).optional(),
});

export const presenceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/locations/me/status', { preHandler: requireUser }, async (request) => {
    const result = await pool.query(
      'SELECT location_features_enabled FROM user_settings WHERE user_id=$1',
      [request.user.sub],
    );
    return { enabled: Boolean(result.rows[0]?.location_features_enabled) };
  });

  app.post('/locations/me', {
    preHandler: requireUser,
    config: { rateLimit: { max: 90, timeWindow: '1 hour' } },
  }, async (request) => {
    const input = locationInput.parse(request.body);
    const recordedAt = await tx(async (client) => {
      await client.query(
        `INSERT INTO user_settings(user_id,location_features_enabled) VALUES($1,true)
         ON CONFLICT(user_id) DO UPDATE SET location_features_enabled=true,updated_at=now()`,
        [request.user.sub],
      );
      let session = await client.query(
        `SELECT id FROM location_sessions
         WHERE user_id=$1 AND source='MINIAPP_FOREGROUND' AND stopped_at IS NULL
         ORDER BY started_at DESC LIMIT 1`,
        [request.user.sub],
      );
      if (!session.rows[0]) {
        session = await client.query(
          `INSERT INTO location_sessions(user_id,source,status,started_at)
           VALUES($1,'MINIAPP_FOREGROUND','ACTIVE',now()) RETURNING id`,
          [request.user.sub],
        );
      }
      const sample = await client.query(
        `INSERT INTO location_samples(user_id,session_id,location,accuracy_meters,recorded_at)
         VALUES($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5,now())
         RETURNING recorded_at`,
        [request.user.sub, session.rows[0].id, input.lng, input.lat, input.accuracy ?? null],
      );
      await client.query('UPDATE users SET last_seen_at=now() WHERE id=$1', [request.user.sub]);
      return sample.rows[0].recorded_at as Date;
    });
    return { enabled: true, recordedAt: recordedAt.toISOString() };
  });

  app.delete('/locations/me', { preHandler: requireUser }, async (request, reply) => {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO user_settings(user_id,location_features_enabled) VALUES($1,false)
         ON CONFLICT(user_id) DO UPDATE SET location_features_enabled=false,updated_at=now()`,
        [request.user.sub],
      );
      await client.query(
        `UPDATE location_sessions SET status='STOPPED',stopped_at=now()
         WHERE user_id=$1 AND source='MINIAPP_FOREGROUND' AND stopped_at IS NULL`,
        [request.user.sub],
      );
    });
    return reply.code(204).send();
  });

  app.get('/locations/friends', { preHandler: requireUser }, async (request) => {
    const result = await pool.query(
      `WITH friends AS (
         SELECT f.following_id user_id
         FROM follows f
         WHERE f.follower_id=$1
           AND EXISTS(SELECT 1 FROM follows back WHERE back.follower_id=f.following_id AND back.following_id=$1)
       )
       SELECT u.id,u.display_name,u.avatar_url,u.telegram_username,
         ST_Y(latest.location::geometry) lat,ST_X(latest.location::geometry) lng,
         latest.accuracy_meters,latest.recorded_at,
         EXTRACT(EPOCH FROM (now()-latest.recorded_at))::int age_seconds
       FROM friends f
       JOIN users u ON u.id=f.user_id AND u.is_blocked=false
       JOIN user_settings settings ON settings.user_id=u.id AND settings.location_features_enabled=true
       JOIN LATERAL (
         SELECT location,accuracy_meters,recorded_at
         FROM location_samples WHERE user_id=u.id
         ORDER BY recorded_at DESC LIMIT 1
       ) latest ON latest.recorded_at > now()-interval '24 hours'
       ORDER BY latest.recorded_at DESC
       LIMIT 100`,
      [request.user.sub],
    );
    return {
      items: result.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        telegramUsername: row.telegram_username,
        coordinates: { lat: Number(row.lat), lng: Number(row.lng) },
        accuracy: row.accuracy_meters == null ? null : Number(row.accuracy_meters),
        recordedAt: new Date(row.recorded_at).toISOString(),
        isLive: Number(row.age_seconds) < 10 * 60,
      })),
    };
  });
};
