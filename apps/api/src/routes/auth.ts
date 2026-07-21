import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool, tx } from '../db.js';
import { env } from '../env.js';
import { requireUser, resolveTelegramUser } from '../auth.js';
import { serializeUser } from '../serializers.js';

const bodySchema = z.object({ initData: z.string().default(''), referral: z.string().max(80).optional() });

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/telegram', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { initData, referral } = bodySchema.parse(request.body ?? {});
    let telegram;
    try { telegram = resolveTelegramUser(initData); } catch (error) { return reply.code(401).send({ code: 'TELEGRAM_AUTH_FAILED', message: (error as Error).message }); }
    const user = await tx(async (client) => {
      const result = await client.query(`INSERT INTO users(telegram_user_id,telegram_username,first_name,last_name,display_name,avatar_url,language_code)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(telegram_user_id) DO UPDATE SET telegram_username=EXCLUDED.telegram_username,
        first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url),last_seen_at=now()
        RETURNING *`, [telegram.id, telegram.username ?? null, telegram.first_name, telegram.last_name ?? null, [telegram.first_name, telegram.last_name].filter(Boolean).join(' '), telegram.photo_url ?? null, telegram.language_code ?? 'ru']);
      const row = result.rows[0];
      await client.query('INSERT INTO user_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING', [row.id]);
      await client.query(`INSERT INTO invitations(inviter_user_id,referral_code,start_parameter) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [row.id, `pin-${row.id.slice(0, 8)}`, `ref_${row.id.slice(0, 12)}`]);
      if (referral) {
        const invite = await client.query('SELECT * FROM invitations WHERE start_parameter=$1 AND inviter_user_id<>$2', [referral, row.id]);
        if (invite.rows[0]) {
          await client.query('UPDATE invitations SET invited_user_id=$1,accepted_at=now() WHERE id=$2 AND invited_user_id IS NULL', [row.id, invite.rows[0].id]);
          await client.query(`INSERT INTO notifications(user_id,actor_user_id,type,entity_type,entity_id,payload_json) VALUES($1,$2,'INVITE_ACCEPTED','USER',$2,$3)`, [invite.rows[0].inviter_user_id, row.id, JSON.stringify({ displayName: row.display_name })]);
        }
      }
      return row;
    });
    const payload = { sub: user.id, telegramUserId: String(user.telegram_user_id) };
    return { accessToken: app.jwt.sign({ ...payload, kind: 'access' }, { expiresIn: `${env.SESSION_TTL_MINUTES}m` }), refreshToken: app.jwt.sign({ ...payload, kind: 'refresh' }, { expiresIn: '30d' }), user: serializeUser(user) };
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = z.object({ refreshToken: z.string() }).parse(request.body);
    try {
      const decoded = app.jwt.verify<{ sub: string; telegramUserId: string; kind: string }>(body.refreshToken);
      if (decoded.kind !== 'refresh') throw new Error();
      return { accessToken: app.jwt.sign({ sub: decoded.sub, telegramUserId: decoded.telegramUserId, kind: 'access' }, { expiresIn: `${env.SESSION_TTL_MINUTES}m` }) };
    } catch { return reply.code(401).send({ code: 'INVALID_REFRESH_TOKEN', message: 'Сессия закончилась. Откройте Pinory заново.' }); }
  });
  app.post('/auth/logout', { preHandler: requireUser }, async () => ({ ok: true }));
  app.get('/auth/me', { preHandler: requireUser }, async (request, reply) => {
    const result = await pool.query('SELECT * FROM users WHERE id=$1 AND is_blocked=false', [request.user.sub]);
    if (!result.rows[0]) return reply.code(404).send({ code: 'USER_NOT_FOUND', message: 'Пользователь не найден' });
    return serializeUser(result.rows[0]);
  });
};
