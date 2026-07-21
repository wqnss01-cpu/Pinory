import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { env } from './env.js';
import { pool } from './db.js';
import { authRoutes } from './routes/auth.js';
import { mapRoutes } from './routes/map.js';
import { entryRoutes } from './routes/entries.js';
import { socialRoutes } from './routes/social.js';
import { collectionRoutes } from './routes/collections.js';
import { collectionMediaRoutes } from './routes/collection-media.js';
import { geocodingRoutes } from './routes/geocoding.js';
import { discoveryRoutes } from './routes/discovery.js';
import { adminRoutes } from './routes/admin.js';
import { registerTelegramBot } from './telegram-bot.js';

const app = Fastify({
  logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
  bodyLimit: 16 * 1024 * 1024,
  trustProxy: env.NODE_ENV === 'production',
});

const productionOrigins = new Set([
  ...env.CORS_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean),
  ...(env.TELEGRAM_MINI_APP_URL ? [new URL(env.TELEGRAM_MINI_APP_URL).origin] : []),
]);

await app.register(cors, {
  origin: env.NODE_ENV === 'production'
    ? (origin, callback) => callback(null, !origin || productionOrigins.has(origin))
    : true,
  credentials: false,
});
await app.register(jwt, { secret: env.JWT_SECRET });
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 10 } });
await app.register(rateLimit, { max: 180, timeWindow: '1 minute' });

if (env.NODE_ENV !== 'production' || env.ENABLE_API_DOCS) {
  await app.register(swagger, {
    openapi: {
      info: { title: 'Pinory API', version: '1.0.0', description: 'Telegram Mini App — живой атлас мест и воспоминаний' },
      servers: [{ url: '/api/v1' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
}

app.get('/health', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok', service: 'pinory-api', time: new Date().toISOString() };
});

await app.register(async (api) => {
  await api.register(authRoutes);
  await api.register(geocodingRoutes);
  await api.register(mapRoutes);
  await api.register(entryRoutes);
  await api.register(socialRoutes);
  await api.register(collectionRoutes);
  await api.register(collectionMediaRoutes);
  await api.register(discoveryRoutes);
  await api.register(adminRoutes);
  await registerTelegramBot(api);
}, { prefix: '/api/v1' });

if (env.NODE_ENV === 'production') {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const miniappRoot = path.resolve(currentDirectory, '../../miniapp/dist');
  await app.register(fastifyStatic, { root: miniappRoot, prefix: '/' });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/') && request.url !== '/health') {
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    }
    return reply.code(404).send({ code: 'NOT_FOUND', message: 'Маршрут не найден' });
  });
}

app.setErrorHandler((rawError, request, reply) => {
  const error = rawError as Error & { statusCode?: number; code?: string };
  request.log.error(error);
  if (error instanceof ZodError) {
    return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Проверьте заполненные поля', details: error.flatten() });
  }
  if (typeof error.statusCode === 'number') {
    return reply.code(error.statusCode).send({ code: error.code ?? 'REQUEST_ERROR', message: error.message });
  }
  const known = ['недоступ', 'Неверн', 'устарел', 'отсутств', 'Поддерж', 'больше', 'прав'];
  const status = known.some((part) => error.message.includes(part)) ? 400 : 500;
  return reply.code(status).send({
    code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
    message: status === 500 ? 'Что-то пошло не так. Попробуйте ещё раз.' : error.message,
  });
});

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Shutting down Pinory API');
  await app.close();
  await pool.end();
}

if (env.NODE_ENV !== 'test') {
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  app.listen({ port: env.API_PORT, host: '0.0.0.0' }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}

export { app };
