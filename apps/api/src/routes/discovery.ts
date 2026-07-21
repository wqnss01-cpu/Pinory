import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool, decodeCursor, encodeCursor } from '../db.js';
import { requireUser } from '../auth.js';
import { entrySelect, serializeEntry, serializePlace, serializeUser } from '../serializers.js';

const feedQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  city: z.string().optional(),
});

const page = (rows: any[], limit: number, serialize: (row: any) => any) => {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  return { items: selected.map(serialize), nextCursor: hasMore ? encodeCursor(selected.at(-1).created_at) : null };
};

export const discoveryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/feed/following', { preHandler: requireUser }, async (request) => {
    const q = feedQuery.parse(request.query);
    const result = await pool.query(
      `${entrySelect} JOIN follows f ON f.following_id=e.user_id AND f.follower_id=$1 WHERE e.deleted_at IS NULL AND e.entry_type<>'STORY' AND pinory_entry_visible(e.user_id,e.visibility,$1) AND ($2::timestamptz IS NULL OR e.created_at<$2) ORDER BY e.created_at DESC LIMIT $3`,
      [request.user.sub, decodeCursor(q.cursor), q.limit + 1],
    );
    return page(result.rows, q.limit, serializeEntry);
  });

  app.get('/feed/nearby', { preHandler: requireUser }, async (request) => {
    const q = feedQuery.parse(request.query);
    const lat = q.lat ?? 55.751244;
    const lng = q.lng ?? 37.618423;
    const result = await pool.query(
      `${entrySelect} WHERE e.deleted_at IS NULL AND e.entry_type<>'STORY' AND e.visibility='PUBLIC' AND ($1::timestamptz IS NULL OR e.created_at<$1) AND (($2::text IS NOT NULL AND p.city ILIKE $2) OR ($2::text IS NULL AND ST_DWithin(p.location,ST_SetSRID(ST_MakePoint($4,$3),4326)::geography,50000))) ORDER BY p.popularity_score DESC,e.created_at DESC LIMIT $5`,
      [decodeCursor(q.cursor), q.city ?? null, lat, lng, q.limit + 1],
    );
    return page(result.rows, q.limit, serializeEntry);
  });

  app.get('/feed/global', { preHandler: requireUser }, async (request) => {
    const q = feedQuery.parse(request.query);
    const result = await pool.query(
      `${entrySelect} WHERE e.deleted_at IS NULL AND e.entry_type<>'STORY' AND e.visibility='PUBLIC' AND ($1::timestamptz IS NULL OR e.created_at<$1) ORDER BY (p.popularity_score + e.comments_count*2 + e.views_count*.2) DESC,e.created_at DESC LIMIT $2`,
      [decodeCursor(q.cursor), q.limit + 1],
    );
    return page(result.rows, q.limit, serializeEntry);
  });

  app.get('/feed/collections', { preHandler: requireUser }, async (request) => {
    const q = feedQuery.parse(request.query);
    const result = await pool.query(
      `SELECT c.*,u.display_name,u.avatar_url,m.medium_url cover_url FROM collections c JOIN users u ON u.id=c.user_id LEFT JOIN media m ON m.id=c.cover_media_id WHERE c.visibility='PUBLIC' AND c.deleted_at IS NULL AND ($1::timestamptz IS NULL OR c.created_at<$1) ORDER BY (c.followers_count*2+c.places_count) DESC,c.created_at DESC LIMIT $2`,
      [decodeCursor(q.cursor), q.limit + 1],
    );
    return page(result.rows, q.limit, (row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      coverUrl: row.cover_url,
      placesCount: Number(row.places_count),
      followersCount: Number(row.followers_count),
      createdAt: row.created_at,
      author: { id: row.user_id, displayName: row.display_name, avatarUrl: row.avatar_url },
    }));
  });

  app.get('/search', { preHandler: requireUser }, async (request) => {
    const q = z.object({
      query: z.string().trim().min(1),
      type: z.enum(['all', 'places', 'users', 'collections']).default('all'),
      city: z.string().optional(),
      category: z.string().optional(),
    }).parse(request.query);
    const response: any = { places: [], users: [], collections: [] };

    if (q.type === 'all' || q.type === 'places') {
      const result = await pool.query(
        `SELECT p.*,ST_Y(location::geometry) lat,ST_X(location::geometry) lng,pc.code category_code,pc.name category_name,
          (SELECT count(*) FROM map_entries e WHERE e.place_id=p.id AND e.deleted_at IS NULL AND e.entry_type<>'STORY' AND pinory_entry_visible(e.user_id,e.visibility,$4))::int entries_count,
          (SELECT count(*) FROM map_entries e WHERE e.place_id=p.id AND e.entry_type='VISITED' AND e.deleted_at IS NULL AND pinory_entry_visible(e.user_id,e.visibility,$4))::int visited_count,
          (SELECT count(*) FROM map_entries e WHERE e.place_id=p.id AND e.entry_type='WISHLIST' AND e.deleted_at IS NULL AND pinory_entry_visible(e.user_id,e.visibility,$4))::int wishlist_count
         FROM places p LEFT JOIN place_categories pc ON pc.id=p.category_id WHERE (p.normalized_name % lower($1) OR p.normalized_name LIKE '%'||lower($1)||'%' OR p.city ILIKE '%'||$1||'%') AND ($2::text IS NULL OR p.city ILIKE $2) AND ($3::text IS NULL OR pc.code=$3) ORDER BY similarity(p.normalized_name,lower($1)) DESC,p.popularity_score DESC LIMIT 20`,
        [q.query, q.city ?? null, q.category ?? null, request.user.sub],
      );
      response.places = result.rows.map(serializePlace);
    }
    if (q.type === 'all' || q.type === 'users') {
      const result = await pool.query(
        `SELECT u.*,
          EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=u.id) is_following,
          EXISTS(SELECT 1 FROM follows f JOIN follows back ON back.follower_id=f.following_id AND back.following_id=f.follower_id WHERE f.follower_id=$2 AND f.following_id=u.id) is_friend
         FROM users u WHERE u.is_blocked=false AND (u.display_name ILIKE '%'||$1||'%' OR u.telegram_username ILIKE '%'||$1||'%') ORDER BY similarity(u.display_name,$1) DESC LIMIT 20`,
        [q.query, request.user.sub],
      );
      response.users = result.rows.map((row) => serializeUser(row));
    }
    if (q.type === 'all' || q.type === 'collections') {
      const result = await pool.query(
        `SELECT c.*,u.display_name,u.avatar_url,m.medium_url cover_url FROM collections c JOIN users u ON u.id=c.user_id LEFT JOIN media m ON m.id=c.cover_media_id WHERE c.visibility='PUBLIC' AND c.deleted_at IS NULL AND (c.title ILIKE '%'||$1||'%' OR c.description ILIKE '%'||$1||'%' OR u.display_name ILIKE '%'||$1||'%') ORDER BY similarity(c.title,$1) DESC,c.followers_count DESC LIMIT 20`,
        [q.query],
      );
      response.collections = result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        coverUrl: row.cover_url,
        placesCount: Number(row.places_count),
        followersCount: Number(row.followers_count),
        author: { id: row.user_id, displayName: row.display_name, avatarUrl: row.avatar_url },
      }));
    }
    return response;
  });

  app.get('/places/:id/entries', { preHandler: requireUser }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await pool.query(
      `${entrySelect} WHERE e.place_id=$1 AND e.deleted_at IS NULL AND e.entry_type<>'STORY' AND pinory_entry_visible(e.user_id,e.visibility,$2) ORDER BY e.created_at DESC LIMIT 100`,
      [id, request.user.sub],
    );
    return { items: result.rows.map(serializeEntry), nextCursor: null };
  });

  app.get('/places/:id/collections', { preHandler: requireUser }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await pool.query(
      `SELECT DISTINCT c.*,u.display_name,u.avatar_url FROM collections c JOIN users u ON u.id=c.user_id JOIN collection_entries ce ON ce.collection_id=c.id JOIN map_entries e ON e.id=ce.map_entry_id WHERE e.place_id=$1 AND c.deleted_at IS NULL AND pinory_entry_visible(c.user_id,c.visibility,$2) ORDER BY c.followers_count DESC LIMIT 50`,
      [id, request.user.sub],
    );
    return { items: result.rows, nextCursor: null };
  });

  app.get('/catalog/markers', { preHandler: requireUser }, async () => {
    const result = await pool.query(`SELECT mi.id,mi.code,mi.name,mi.asset_url icon,pc.code category_code FROM marker_icons mi LEFT JOIN place_categories pc ON pc.id=mi.category_id WHERE mi.is_active=true ORDER BY mi.sort_order`);
    return { items: result.rows };
  });

  app.get('/catalog/categories', { preHandler: requireUser }, async () => {
    const result = await pool.query('SELECT id,code,name,icon FROM place_categories WHERE is_active=true ORDER BY sort_order');
    return { items: result.rows };
  });

  app.post('/analytics', { preHandler: requireUser }, async (request, reply) => {
    const body = z.object({ name: z.string().min(2).max(80), properties: z.record(z.unknown()).default({}) }).parse(request.body);
    delete (body.properties as any).coordinates;
    delete (body.properties as any).location;
    await pool.query('INSERT INTO analytics_events(user_id,name,properties) VALUES($1,$2,$3)', [request.user.sub, body.name, JSON.stringify(body.properties)]);
    return reply.code(204).send();
  });

  app.get('/invitations/me', { preHandler: requireUser }, async (request) => {
    const result = await pool.query('SELECT referral_code,start_parameter FROM invitations WHERE inviter_user_id=$1 ORDER BY created_at LIMIT 1', [request.user.sub]);
    return result.rows[0];
  });
};
