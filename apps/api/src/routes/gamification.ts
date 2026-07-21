import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { pool } from '../db.js';

const catalog = [
  { code: 'first_pin', title: 'Первая точка', description: 'Сохранить первое посещённое место', metric: 'visited', target: 1, xp: 80, icon: 'pin' },
  { code: 'pathfinder', title: 'Следопыт', description: 'Отметить 5 посещённых мест', metric: 'visited', target: 5, xp: 120, icon: 'compass' },
  { code: 'atlas_keeper', title: 'Хранитель атласа', description: 'Отметить 20 посещённых мест', metric: 'visited', target: 20, xp: 220, icon: 'map' },
  { code: 'dream_collector', title: 'Коллекционер мечт', description: 'Добавить 10 мест в желания', metric: 'wishlist', target: 10, xp: 130, icon: 'sparkles' },
  { code: 'storyteller', title: 'Рассказчик', description: 'Написать истории к 3 местам', metric: 'stories', target: 3, xp: 140, icon: 'feather' },
  { code: 'photographer', title: 'Ловец света', description: 'Добавить 5 фотографий', metric: 'photos', target: 5, xp: 150, icon: 'camera' },
  { code: 'good_company', title: 'В хорошей компании', description: 'Найти 3 взаимных друзей', metric: 'friends', target: 3, xp: 160, icon: 'users' },
  { code: 'curator', title: 'Куратор маршрутов', description: 'Создать 3 подборки', metric: 'collections', target: 3, xp: 150, icon: 'layers' },
  { code: 'city_hopper', title: 'Между городами', description: 'Сохранить места в 3 городах', metric: 'cities', target: 3, xp: 180, icon: 'route' },
] as const;

export const gamificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users/:id/achievements', { preHandler: requireUser }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const metricsResult = await pool.query(
      `SELECT u.id,
        (SELECT count(*) FROM map_entries e WHERE e.user_id=u.id AND e.entry_type='VISITED' AND e.deleted_at IS NULL)::int visited,
        (SELECT count(*) FROM map_entries e WHERE e.user_id=u.id AND e.entry_type='WISHLIST' AND e.deleted_at IS NULL)::int wishlist,
        (SELECT count(*) FROM map_entries e WHERE e.user_id=u.id AND e.deleted_at IS NULL AND length(trim(coalesce(e.description,'')))>=20)::int stories,
        (SELECT count(*) FROM media m WHERE m.owner_user_id=u.id AND m.deleted_at IS NULL)::int photos,
        (SELECT count(*) FROM follows f WHERE f.follower_id=u.id AND EXISTS(SELECT 1 FROM follows back WHERE back.follower_id=f.following_id AND back.following_id=u.id))::int friends,
        (SELECT count(*) FROM collections c WHERE c.user_id=u.id AND c.deleted_at IS NULL)::int collections,
        (SELECT count(DISTINCT p.city) FROM map_entries e JOIN places p ON p.id=e.place_id WHERE e.user_id=u.id AND e.deleted_at IS NULL AND p.city IS NOT NULL)::int cities
       FROM users u WHERE u.id=$1 AND u.is_blocked=false`,
      [id],
    );
    if (!metricsResult.rows[0]) return reply.code(404).send({ code: 'USER_NOT_FOUND', message: 'Пользователь не найден' });
    const metrics = metricsResult.rows[0] as Record<string, number | string>;
    const unlockedCodes = catalog.filter((item) => Number(metrics[item.metric] ?? 0) >= item.target).map((item) => item.code);
    if (unlockedCodes.length) {
      await pool.query(
        `INSERT INTO user_achievements(user_id,achievement_code)
         SELECT $1,code FROM unnest($2::text[]) code ON CONFLICT DO NOTHING`,
        [id, unlockedCodes],
      );
    }
    const unlocks = await pool.query('SELECT achievement_code,unlocked_at FROM user_achievements WHERE user_id=$1', [id]);
    const dates = new Map(unlocks.rows.map((row) => [row.achievement_code as string, new Date(row.unlocked_at).toISOString()]));
    const achievements = catalog.map((item) => ({
      code: item.code,
      title: item.title,
      description: item.description,
      icon: item.icon,
      xp: item.xp,
      progress: Math.min(Number(metrics[item.metric] ?? 0), item.target),
      target: item.target,
      unlockedAt: dates.get(item.code) ?? null,
    }));
    const totalXp = achievements.filter((item) => item.unlockedAt).reduce((sum, item) => sum + item.xp, 0);
    const level = Math.floor(totalXp / 250) + 1;
    return { level, totalXp, levelXp: totalXp % 250, nextLevelXp: 250, achievements };
  });
};
