import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { bboxSchema } from '@pinory/shared';
import { pool } from '../db.js';
import { requireUser } from '../auth.js';
import { env } from '../env.js';
import { entrySelect, serializeEntry, serializePlace } from '../serializers.js';

const mapQuery = z.object({ bbox: bboxSchema, zoom: z.coerce.number().min(0).max(24).default(10), entryTypes: z.string().optional(), categories: z.string().optional(), userIds: z.string().optional(), layers: z.string().default('mine,friends,public') });
const validLayers = new Set(['mine','friends','public']);
const layerClause = (raw:string) => {
  const layers=raw.split(',').filter((layer)=>validLayers.has(layer));
  const clauses:string[]=[];
  if(layers.includes('mine')) clauses.push('e.user_id=$1');
  if(layers.includes('friends')) clauses.push(`(e.user_id<>$1 AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=e.user_id))`);
  if(layers.includes('public')) clauses.push(`(e.user_id<>$1 AND e.visibility='PUBLIC')`);
  return clauses.length?`(${clauses.join(' OR ')})`:'FALSE';
};

type NominatimResult={lat:string;lon:string;display_name:string;name?:string;type?:string;class?:string;address?:Record<string,string>};
const categoryFromResult=(item:NominatimResult)=>{
  const value=`${item.class??''} ${item.type??''}`;
  if(/cafe|coffee/.test(value))return'cafe';if(/restaurant|food/.test(value))return'restaurant';if(/museum|gallery/.test(value))return'museum';
  if(/park|garden|nature/.test(value))return'nature';if(/hotel|hostel/.test(value))return'hotel';if(/beach/.test(value))return'beach';
  if(/mountain|peak/.test(value))return'mountain';if(/viewpoint/.test(value))return'viewpoint';if(/historic|castle|monument|building/.test(value))return'architecture';return'other';
};

export const mapRoutes: FastifyPluginAsync = async (app) => {
  app.get('/map/entries', { preHandler: requireUser }, async (request) => {
    const q = mapQuery.parse(request.query); const types = q.entryTypes?.split(',').filter(Boolean) ?? []; const categories = q.categories?.split(',').filter(Boolean) ?? []; const userIds = q.userIds?.split(',').filter(Boolean) ?? [];
    const values: unknown[] = [request.user.sub, q.bbox.west, q.bbox.south, q.bbox.east, q.bbox.north];
    const where = [`e.deleted_at IS NULL`, `u.is_blocked=false`, `ST_Intersects(p.location, ST_MakeEnvelope($2,$3,$4,$5,4326)::geography)`, `pinory_entry_visible(e.user_id,e.visibility,$1)`, `(e.entry_type<>'STORY' OR (e.expires_at>now() AND EXISTS(SELECT 1 FROM map_entry_media em JOIN media m ON m.id=em.media_id WHERE em.map_entry_id=e.id AND m.deleted_at IS NULL)))`,layerClause(q.layers)];
    values.push(types); where.push(`(e.entry_type='STORY' OR e.entry_type=ANY($${values.length}::entry_type[]))`);
    if (categories.length) { values.push(categories); where.push(`pc.code=ANY($${values.length})`); }
    if (userIds.length) { values.push(userIds); where.push(`e.user_id=ANY($${values.length}::uuid[])`); }
    const result = await pool.query(`${entrySelect} WHERE ${where.join(' AND ')} ORDER BY e.created_at DESC LIMIT 500`, values);
    return { items: result.rows.map(serializeEntry), meta: { bounded: true, zoom: q.zoom, count: result.rowCount } };
  });

  app.get('/map/clusters', { preHandler: requireUser }, async (request) => {
    const q = mapQuery.parse(request.query); const cell = Math.max(0.005, 90 / 2 ** q.zoom);
    const result = await pool.query(`SELECT round(ST_X(p.location::geometry)/$6)*$6 lng, round(ST_Y(p.location::geometry)/$6)*$6 lat, count(*)::int count,
      array_agg(e.id ORDER BY e.created_at DESC)[1:8] entry_ids FROM map_entries e JOIN places p ON p.id=e.place_id JOIN users u ON u.id=e.user_id
      WHERE e.deleted_at IS NULL AND u.is_blocked=false AND pinory_entry_visible(e.user_id,e.visibility,$1) AND ${layerClause(q.layers)}
      AND (e.entry_type<>'STORY' OR (e.expires_at>now() AND EXISTS(SELECT 1 FROM map_entry_media em JOIN media m ON m.id=em.media_id WHERE em.map_entry_id=e.id AND m.deleted_at IS NULL)))
      AND ST_Intersects(p.location,ST_MakeEnvelope($2,$3,$4,$5,4326)::geography) GROUP BY 1,2 LIMIT 500`, [request.user.sub, q.bbox.west, q.bbox.south, q.bbox.east, q.bbox.north, cell]);
    return { items: result.rows.map((r) => ({ coordinates: { lat: Number(r.lat), lng: Number(r.lng) }, count: r.count, entryIds: r.entry_ids })) };
  });

  app.get('/map/users', { preHandler: requireUser }, async (request) => {
    const q = mapQuery.parse(request.query);
    const result = await pool.query(`SELECT DISTINCT ON(u.id) u.id,u.display_name,u.avatar_url,ST_Y(p.location::geometry) lat,ST_X(p.location::geometry) lng,e.created_at
      FROM follows f JOIN users u ON u.id=f.following_id JOIN map_entries e ON e.user_id=u.id JOIN places p ON p.id=e.place_id
      WHERE f.follower_id=$1 AND e.deleted_at IS NULL AND e.entry_type<>'STORY' AND pinory_entry_visible(e.user_id,e.visibility,$1)
      AND ST_Intersects(p.location,ST_MakeEnvelope($2,$3,$4,$5,4326)::geography) ORDER BY u.id,e.created_at DESC`, [request.user.sub, q.bbox.west, q.bbox.south, q.bbox.east, q.bbox.north]);
    return { items: result.rows.map((r) => ({ id: r.id, displayName: r.display_name, avatarUrl: r.avatar_url, coordinates: { lat: Number(r.lat), lng: Number(r.lng) } })) };
  });

  app.get('/places/geocode', { preHandler: requireUser }, async (request,reply) => {
    const q=z.object({query:z.string().trim().min(3).max(160),limit:z.coerce.number().min(1).max(8).default(6)}).parse(request.query);
    const url=new URL(env.GEOCODING_URL);url.searchParams.set('q',q.query);url.searchParams.set('format','jsonv2');url.searchParams.set('addressdetails','1');url.searchParams.set('accept-language','ru');url.searchParams.set('limit',String(q.limit));
    try{
      const response=await fetch(url,{headers:{'User-Agent':env.GEOCODING_USER_AGENT,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error(`Geocoding ${response.status}`);
      const items=(await response.json()) as NominatimResult[];
      return{items:items.map((item,index)=>{const address=item.address??{};const name=item.name??address.amenity??address.tourism??address.road??item.display_name.split(',')[0]??q.query;return{id:`geo-${index}-${item.lat}-${item.lon}`,name,address:item.display_name,city:address.city??address.town??address.village??address.municipality??null,countryName:address.country??null,categoryCode:categoryFromResult(item),coordinates:{lat:Number(item.lat),lng:Number(item.lon)}};})};
    }catch(error){request.log.warn({error},'geocoding unavailable');return reply.code(502).send({code:'GEOCODING_UNAVAILABLE',message:'Поиск адреса временно недоступен. Выберите точку на карте.'});}
  });

  app.get('/places/search', { preHandler: requireUser }, async (request) => {
    const q = z.object({ query: z.string().trim().min(1), city: z.string().optional(), limit: z.coerce.number().min(1).max(50).default(20) }).parse(request.query);
    const result = await pool.query(`SELECT p.*,ST_Y(location::geometry) lat,ST_X(location::geometry) lng,pc.code category_code,pc.name category_name,
      count(e.id)::int entries_count,count(e.id) FILTER(WHERE e.entry_type='VISITED')::int visited_count,count(e.id) FILTER(WHERE e.entry_type='WISHLIST')::int wishlist_count
      FROM places p LEFT JOIN place_categories pc ON pc.id=p.category_id LEFT JOIN map_entries e ON e.place_id=p.id AND e.deleted_at IS NULL AND e.visibility='PUBLIC' AND e.entry_type<>'STORY'
      WHERE (p.normalized_name % lower($1) OR p.normalized_name LIKE '%'||lower($1)||'%' OR p.address ILIKE '%'||$1||'%') AND ($2::text IS NULL OR p.city ILIKE $2)
      GROUP BY p.id,pc.code,pc.name ORDER BY similarity(p.normalized_name,lower($1)) DESC,p.popularity_score DESC LIMIT $3`, [q.query, q.city ?? null, q.limit]);
    return { items: result.rows.map(serializePlace), nextCursor: null };
  });

  app.get('/places/nearby', { preHandler: requireUser }, async (request) => {
    const q = z.object({ lat: z.coerce.number(), lng: z.coerce.number(), radius: z.coerce.number().min(100).max(50000).default(10000) }).parse(request.query);
    const result = await pool.query(`SELECT p.*,ST_Y(location::geometry) lat,ST_X(location::geometry) lng,pc.code category_code,pc.name category_name,
      ST_Distance(location,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography) distance,0 entries_count,0 visited_count,0 wishlist_count
      FROM places p LEFT JOIN place_categories pc ON pc.id=p.category_id WHERE ST_DWithin(location,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography,$3)
      ORDER BY popularity_score DESC,distance LIMIT 50`, [q.lat, q.lng, q.radius]);
    return { items: result.rows.map((r) => ({ ...serializePlace(r), distance: Math.round(Number(r.distance)) })) };
  });

  app.get('/places/:id', { preHandler: requireUser }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await pool.query(`SELECT p.*,ST_Y(location::geometry) lat,ST_X(location::geometry) lng,pc.code category_code,pc.name category_name,
      count(e.id) FILTER(WHERE e.deleted_at IS NULL AND e.visibility='PUBLIC' AND e.entry_type<>'STORY')::int entries_count,count(e.id) FILTER(WHERE e.entry_type='VISITED' AND e.deleted_at IS NULL)::int visited_count,
      count(e.id) FILTER(WHERE e.entry_type='WISHLIST' AND e.deleted_at IS NULL)::int wishlist_count FROM places p LEFT JOIN place_categories pc ON pc.id=p.category_id LEFT JOIN map_entries e ON e.place_id=p.id WHERE p.id=$1 GROUP BY p.id,pc.code,pc.name`, [id]);
    if (!result.rows[0]) return reply.code(404).send({ code: 'PLACE_NOT_FOUND', message: 'Место не найдено' }); return serializePlace(result.rows[0]);
  });

  app.post('/places', { preHandler: requireUser }, async (request) => {
    const { CreatePlaceSchema } = await import('@pinory/shared'); const input = CreatePlaceSchema.parse(request.body);
    const result = await pool.query(`INSERT INTO places(name,normalized_name,category_id,location,city,country_name,address,created_by_user_id)
      VALUES($1,lower($1),(SELECT id FROM place_categories WHERE code=$2),ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5,$6,$7,$8)
      RETURNING *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng`, [input.name,input.categoryCode,input.coordinates.lng,input.coordinates.lat,input.city??null,input.countryName??null,input.address??null,request.user.sub]);
    return serializePlace({ ...result.rows[0], category_code: input.categoryCode, category_name: input.categoryCode });
  });
};
