import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env.js';
import type { TelegramIdentity } from './telegram-user.js';

const issuer = 'https://oauth.telegram.org';
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

export const randomBase64Url = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const secretHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const pkceChallenge = (verifier: string) => crypto.createHash('sha256').update(verifier).digest('base64url');

export function telegramOidcCallbackUrl() {
  if (env.TELEGRAM_OIDC_REDIRECT_URL) return env.TELEGRAM_OIDC_REDIRECT_URL;
  if (!env.PUBLIC_API_URL) throw new Error('PUBLIC_API_URL не настроен');
  return `${env.PUBLIC_API_URL.replace(/\/+$/, '')}/auth/telegram/oidc/callback`;
}

export function ensureTelegramOidcConfigured() {
  if (!env.TELEGRAM_OIDC_CLIENT_ID || !env.TELEGRAM_OIDC_CLIENT_SECRET) {
    throw new Error('Вход Telegram для Android пока не настроен');
  }
}

export function buildTelegramAuthorizationUrl(input: { state: string; nonce: string; challenge: string }) {
  ensureTelegramOidcConfigured();
  const url = new URL(`${issuer}/auth`);
  url.search = new URLSearchParams({
    client_id: env.TELEGRAM_OIDC_CLIENT_ID!,
    redirect_uri: telegramOidcCallbackUrl(),
    response_type: 'code',
    scope: 'openid profile',
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export async function exchangeTelegramCode(code: string, verifier: string) {
  ensureTelegramOidcConfigured();
  const credentials = Buffer.from(`${env.TELEGRAM_OIDC_CLIENT_ID}:${env.TELEGRAM_OIDC_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${issuer}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: telegramOidcCallbackUrl(),
      client_id: env.TELEGRAM_OIDC_CLIENT_ID!,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({})) as { id_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.id_token) throw new Error(data.error_description ?? data.error ?? 'Telegram не подтвердил вход');
  return data.id_token;
}

export async function verifyTelegramIdToken(idToken: string, expectedNonce: string): Promise<TelegramIdentity> {
  ensureTelegramOidcConfigured();
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: env.TELEGRAM_OIDC_CLIENT_ID!,
    algorithms: ['RS256'],
    clockTolerance: 5,
  });
  if (payload.nonce !== expectedNonce) throw new Error('Telegram вернул неверный nonce');
  const telegramId = payload.id ?? payload.sub;
  if (!telegramId || !/^\d+$/.test(String(telegramId))) throw new Error('Telegram ID отсутствует');
  const fullName = typeof payload.name === 'string' ? payload.name.trim() : '';
  const firstName = typeof payload.given_name === 'string' && payload.given_name.trim()
    ? payload.given_name.trim()
    : fullName || (typeof payload.preferred_username === 'string' ? payload.preferred_username : 'Пользователь Telegram');
  return {
    id: String(telegramId),
    firstName,
    lastName: typeof payload.family_name === 'string' ? payload.family_name : null,
    username: typeof payload.preferred_username === 'string' ? payload.preferred_username : null,
    photoUrl: typeof payload.picture === 'string' ? payload.picture : null,
    languageCode: 'ru',
  };
}
