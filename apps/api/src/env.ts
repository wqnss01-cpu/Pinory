import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z.string().default('false').transform((value) => value === 'true');
const northflankHost = process.env.NF_HOSTS
  ?.split(',')
  .map((value) => value.trim())
  .find(Boolean);
const renderOrigin = process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/+$/, '')
  ?? (process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : undefined);
const platformOrigin = renderOrigin
  ?? (process.env.KOYEB_PUBLIC_DOMAIN
    ? `https://${process.env.KOYEB_PUBLIC_DOMAIN}`
    : northflankHost
      ? `https://${northflankHost}`
      : undefined);
const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL ?? platformOrigin;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_API_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().default(''),
  DATABASE_URL: z.string().min(1).default('postgresql://pinory:pinory@localhost:5432/pinory'),
  DATABASE_SSL: booleanFromString,
  DB_POOL_MAX: z.coerce.number().int().min(1).max(30).default(5),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16).default('pinory-local-development-secret'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_MINI_APP_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).optional(),
  TELEGRAM_OIDC_CLIENT_ID: z.string().trim().min(1).optional(),
  TELEGRAM_OIDC_CLIENT_SECRET: z.string().trim().min(16).optional(),
  TELEGRAM_OIDC_REDIRECT_URL: z.string().url().optional(),
  MOBILE_APP_DEEP_LINK: z.string().regex(/^pinory:\/\/auth$/).default('pinory://auth'),
  MOBILE_APP_ORIGINS: z.string().default('https://localhost'),
  ALLOW_DEV_TELEGRAM: booleanFromString,
  DEV_TELEGRAM_USER_ID: z.coerce.number().int().positive().optional(),
  DEV_TELEGRAM_FIRST_NAME: z.string().trim().min(1).default('Разработчик'),
  DEV_TELEGRAM_USERNAME: z.string().trim().optional(),
  GEOCODING_URL: z.string().url().default('https://nominatim.openstreetmap.org/search'),
  GEOCODING_USER_AGENT: z.string().min(8).default('Pinory/1.0 (contact@pinory.app)'),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1).default('pinory'),
  S3_SECRET_KEY: z.string().min(1).default('pinory-secret'),
  S3_BUCKET: z.string().min(3).default('pinory-media'),
  S3_PUBLIC_URL: z.string().url().default('http://localhost:9000/pinory-media'),
  S3_FORCE_PATH_STYLE: z.string().default('true').transform((value) => value === 'true'),
  S3_AUTO_CREATE_BUCKET: z.string().default('true').transform((value) => value === 'true'),
  S3_SET_PUBLIC_POLICY: z.string().default('true').transform((value) => value === 'true'),
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  ENABLE_API_DOCS: booleanFromString,
});

const parsed = schema.parse({
  ...process.env,
  API_PORT: process.env.PORT ?? process.env.API_PORT,
  TELEGRAM_MINI_APP_URL: miniAppUrl,
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? (platformOrigin ? `${platformOrigin}/api/v1` : undefined),
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? miniAppUrl ?? '',
});

if (parsed.NODE_ENV === 'production') {
  const missing: string[] = [];
  if (parsed.JWT_SECRET.length < 32) missing.push('JWT_SECRET (не меньше 32 символов)');
  if (!parsed.PUBLIC_API_URL?.startsWith('https://')) missing.push('PUBLIC_API_URL (HTTPS)');
  if (!parsed.TELEGRAM_MINI_APP_URL?.startsWith('https://')) missing.push('TELEGRAM_MINI_APP_URL (HTTPS)');
  if (!parsed.TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!parsed.TELEGRAM_WEBHOOK_SECRET) missing.push('TELEGRAM_WEBHOOK_SECRET');
  if (!parsed.CORS_ORIGINS.trim()) missing.push('CORS_ORIGINS');
  if (parsed.ALLOW_DEV_TELEGRAM) throw new Error('ALLOW_DEV_TELEGRAM должен быть false в production');
  if (missing.length) throw new Error(`Не заданы production-переменные: ${missing.join(', ')}`);
}

export const env = parsed;
