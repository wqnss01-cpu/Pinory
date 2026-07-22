import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { pool, tx } from '../db.js';
import { env } from '../env.js';
import { requireUser, resolveTelegramUser } from '../auth.js';
import { serializeUser } from '../serializers.js';
import {
  buildTelegramAuthorizationUrl,
  ensureTelegramOidcConfigured,
  exchangeTelegramCode,
  pkceChallenge,
  randomBase64Url,
  secretHash,
  verifyTelegramIdToken,
} from '../services/telegram-oidc.js';
import { upsertTelegramUser } from '../services/telegram-user.js';

const bodySchema = z.object({ initData: z.string().default(''), referral: z.string().max(80).optional() });
const startSchema = z.object({ platform: z.literal('android'), referral: z.string().max(80).optional() });
const callbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(20).max(200),
  error: z.string().max(100).optional(),
});
const grantSchema = z.object({ grant: z.string().min(20).max(200) });

function createSession(app: FastifyInstance, user: any) {
  const payload = { sub: user.id, telegramUserId: String(user.telegram_user_id) };
  return {
    accessToken: app.jwt.sign({ ...payload, kind: 'access' }, { expiresIn: `${env.SESSION_TTL_MINUTES}m` }),
    refreshToken: app.jwt.sign({ ...payload, kind: 'refresh' }, { expiresIn: '30d' }),
    user: serializeUser(user),
  };
}

function redirectToMobile(reply: FastifyReply, params: Record<string, string>) {
  const url = new URL(env.MOBILE_APP_DEEP_LINK);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return reply.redirect(url.toString());
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/telegram', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { initData, referral } = bodySchema.parse(request.body ?? {});
    let telegram;
    try {
      telegram = resolveTelegramUser(initData);
    } catch (error) {
      return reply.code(401).send({ code: 'TELEGRAM_AUTH_FAILED', message: (error as Error).message });
    }
    const user = await tx((client) => upsertTelegramUser(client, {
      id: telegram.id,
      firstName: telegram.first_name,
      lastName: telegram.last_name,
      username: telegram.username,
      photoUrl: telegram.photo_url,
      languageCode: telegram.language_code,
    }, referral));
    return createSession(app, user);
  });

  app.get('/auth/telegram/oidc/start', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { referral } = startSchema.parse(request.query);
    try {
      ensureTelegramOidcConfigured();
    } catch (error) {
      return reply.code(503).send({ code: 'TELEGRAM_OIDC_UNAVAILABLE', message: (error as Error).message });
    }
    const state = randomBase64Url();
    const verifier = randomBase64Url(48);
    const nonce = randomBase64Url();
    await pool.query(
      `INSERT INTO telegram_oidc_states(state_hash,code_verifier,nonce,referral,expires_at)
       VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,
      [secretHash(state), verifier, nonce, referral ?? null],
    );
    void pool.query(`DELETE FROM telegram_oidc_states WHERE expires_at<now()-interval '1 day';
                     DELETE FROM mobile_auth_grants WHERE expires_at<now()-interval '1 day'`).catch(() => undefined);
    return reply.redirect(buildTelegramAuthorizationUrl({ state, nonce, challenge: pkceChallenge(verifier) }));
  });

  app.get('/auth/telegram/oidc/callback', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const query = callbackSchema.parse(request.query);
    const stateResult = await pool.query(
      `UPDATE telegram_oidc_states SET consumed_at=now()
       WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now()
       RETURNING code_verifier,nonce,referral`,
      [secretHash(query.state)],
    );
    const loginState = stateResult.rows[0];
    if (!loginState) return redirectToMobile(reply, { error: 'expired' });
    if (query.error || !query.code) return redirectToMobile(reply, { error: 'cancelled' });

    try {
      const idToken = await exchangeTelegramCode(query.code, loginState.code_verifier);
      const telegram = await verifyTelegramIdToken(idToken, loginState.nonce);
      const grant = randomBase64Url(48);
      await tx(async (client) => {
        const user = await upsertTelegramUser(client, telegram, loginState.referral ?? undefined);
        await client.query(
          `INSERT INTO mobile_auth_grants(grant_hash,user_id,expires_at)
           VALUES($1,$2,now()+interval '2 minutes')`,
          [secretHash(grant), user.id],
        );
      });
      return redirectToMobile(reply, { grant });
    } catch (error) {
      request.log.warn({ error: (error as Error).message }, 'Telegram OIDC login failed');
      return redirectToMobile(reply, { error: 'login_failed' });
    }
  });

  app.post('/auth/telegram/mobile/exchange', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { grant } = grantSchema.parse(request.body);
    const user = await tx(async (client) => {
      const consumed = await client.query(
        `UPDATE mobile_auth_grants SET consumed_at=now()
         WHERE grant_hash=$1 AND consumed_at IS NULL AND expires_at>now()
         RETURNING user_id`,
        [secretHash(grant)],
      );
      if (!consumed.rows[0]) return null;
      const result = await client.query('SELECT * FROM users WHERE id=$1 AND is_blocked=false', [consumed.rows[0].user_id]);
      return result.rows[0] ?? null;
    });
    if (!user) return reply.code(401).send({ code: 'INVALID_MOBILE_GRANT', message: 'Ссылка входа устарела. Попробуйте ещё раз.' });
    return createSession(app, user);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = z.object({ refreshToken: z.string() }).parse(request.body);
    try {
      const decoded = app.jwt.verify<{ sub: string; telegramUserId: string; kind: string }>(body.refreshToken);
      if (decoded.kind !== 'refresh') throw new Error();
      return {
        accessToken: app.jwt.sign(
          { sub: decoded.sub, telegramUserId: decoded.telegramUserId, kind: 'access' },
          { expiresIn: `${env.SESSION_TTL_MINUTES}m` },
        ),
      };
    } catch {
      return reply.code(401).send({ code: 'INVALID_REFRESH_TOKEN', message: 'Сессия закончилась. Войдите в Pinory заново.' });
    }
  });

  app.post('/auth/logout', { preHandler: requireUser }, async () => ({ ok: true }));
  app.get('/auth/me', { preHandler: requireUser }, async (request, reply) => {
    const result = await pool.query('SELECT *,ST_Y(home_location::geometry) home_lat,ST_X(home_location::geometry) home_lng FROM users WHERE id=$1 AND is_blocked=false', [request.user.sub]);
    if (!result.rows[0]) return reply.code(404).send({ code: 'USER_NOT_FOUND', message: 'Пользователь не найден' });
    return serializeUser(result.rows[0]);
  });
};
