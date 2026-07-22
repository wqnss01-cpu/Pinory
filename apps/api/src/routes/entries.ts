import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { CreateEntrySchema, UpdateEntrySchema } from '@pinory/shared';
import { z } from 'zod';
import { pool, tx } from '../db.js';
import { requireUser } from '../auth.js';
import { entrySelect, serializeEntry } from '../serializers.js';
import { processAndUpload } from '../services/storage.js';
import { reverseGeography } from '../services/geography.js';

async function getVisibleEntry(id: string, viewerId: string) {
  const result = await pool.query(`${entrySelect} WHERE e.id=$1 AND e.deleted_at IS NULL AND u.is_blocked=false AND pinory_entry_visible(e.user_id,e.visibility,$2) AND (e.entry_type<>'STORY' OR e.expires_at>now())`, [id, viewerId]);
  return result.rows[0] ? serializeEntry(result.rows[0]) : null;
}

export const entryRoutes: FastifyPluginAsync = async (app) => {
  app.post('/entries', { preHandler: requireUser }, async (request, reply) => {
    const input = CreateEntrySchema.parse(request.body); const key = String(request.headers['idempotency-key'] ?? crypto.randomUUID());
    let resolvedPlace = input.place;
    if (resolvedPlace && (!resolvedPlace.countryCode || !resolvedPlace.countryName)) {
      try {
        const geo = await reverseGeography(resolvedPlace.coordinates);
        resolvedPlace = { ...resolvedPlace, city: geo.city ?? undefined, region: geo.region ?? undefined, countryName: geo.countryName ?? undefined, countryCode: geo.countryCode ?? undefined, address: resolvedPlace.address ?? geo.address };
      } catch (error) {
        request.log.warn({ error, coordinates: resolvedPlace.coordinates }, 'entry geography resolution failed');
      }
    }
    const existing = await pool.query(`SELECT response FROM idempotency_keys WHERE user_id=$1 AND key=$2 AND route='POST /entries'`, [request.user.sub, key]);
    if (existing.rows[0]) return existing.rows[0].response;
    const entryId = await tx(async (client) => {
      let placeId = input.placeId;
      if (!placeId && resolvedPlace) {
        const p = resolvedPlace;
        const duplicate = await client.query(`SELECT id FROM places WHERE normalized_name=lower($1) AND ST_DWithin(location,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,40) LIMIT 1`, [p.name,p.coordinates.lng,p.coordinates.lat]);
        placeId = duplicate.rows[0]?.id;
        if (placeId) {
          await client.query(`UPDATE places SET city=COALESCE($2,city),region=COALESCE($3,region),country_name=COALESCE($4,country_name),
            country_code=COALESCE($5::text,country_code),address=COALESCE($6,address),geography_checked_at=CASE WHEN $5::text IS NOT NULL THEN now() ELSE geography_checked_at END WHERE id=$1`,
            [placeId,p.city??null,p.region??null,p.countryName??null,p.countryCode??null,p.address??null]);
        } else {
          const inserted = await client.query(`INSERT INTO places(name,normalized_name,category_id,location,city,region,country_name,country_code,address,created_by_user_id,geography_checked_at)
            VALUES($1,lower($1),(SELECT id FROM place_categories WHERE code=$2),ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5,$6,$7,$8::text,$9,$10,CASE WHEN $8::text IS NOT NULL THEN now() ELSE NULL END) RETURNING id`,
            [p.name,p.categoryCode,p.coordinates.lng,p.coordinates.lat,p.city??null,p.region??null,p.countryName??null,p.countryCode??null,p.address??null,request.user.sub]);
          placeId = inserted.rows[0].id;
        }
      }
      const inserted = await client.query(`INSERT INTO map_entries(user_id,place_id,entry_type,title,description,visit_date,visibility,marker_icon_id,comments_enabled,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT id FROM marker_icons WHERE code=$8),$9,CASE WHEN $3='STORY' THEN now()+interval '24 hours' ELSE NULL END) RETURNING id`,
        [request.user.sub,placeId,input.entryType,input.title,input.description??null,input.visitDate??null,input.visibility,input.markerIconCode,input.entryType==='STORY'?false:input.commentsEnabled]);
      for (let i=0;i<input.collectionIds.length;i++) await client.query(`INSERT INTO collection_entries(collection_id,map_entry_id,sort_order) SELECT $1,$2,$3 FROM collections WHERE id=$1 AND user_id=$4 AND deleted_at IS NULL ON CONFLICT DO NOTHING`, [input.collectionIds[i],inserted.rows[0].id,i,request.user.sub]);
      await client.query(`INSERT INTO analytics_events(user_id,name,properties) VALUES($1,$2,$3)`, [request.user.sub,input.entryType==='STORY'?'story_created':input.entryType==='WISHLIST'?'wishlist_created':'entry_created',JSON.stringify({ placeId })]);
      await client.query(`INSERT INTO idempotency_keys(user_id,key,route,response) VALUES($1,$2,'POST /entries',$3)`, [request.user.sub,key,JSON.stringify({ id: inserted.rows[0].id })]);
      return inserted.rows[0].id as string;
    });
    const entry = await getVisibleEntry(entryId, request.user.sub); return reply.code(201).send(entry);
  });

  app.get('/entries/:id', { preHandler: requireUser }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const entry = await getVisibleEntry(id, request.user.sub);
    if (!entry) return reply.code(404).send({ code: 'ENTRY_NOT_FOUND', message: 'Отметка не найдена или недоступна' }); return entry;
  });

  app.patch('/entries/:id', { preHandler: requireUser }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const input = UpdateEntrySchema.parse(request.body);
    const current = await pool.query('SELECT * FROM map_entries WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [id,request.user.sub]);
    if (!current.rows[0]) return reply.code(404).send({ code: 'ENTRY_NOT_FOUND', message: 'Отметка не найдена' });
    const next = { ...current.rows[0], ...Object.fromEntries(Object.entries(input).map(([k,v]) => [k.replace(/[A-Z]/g,(m)=>`_${m.toLowerCase()}`),v])) };
    await pool.query(`UPDATE map_entries SET entry_type=$1,title=$2,description=$3,visit_date=$4,visibility=$5,
      marker_icon_id=(SELECT id FROM marker_icons WHERE code=$6),comments_enabled=CASE WHEN $1='STORY' THEN false ELSE $7 END,
      expires_at=CASE WHEN $1='STORY' THEN COALESCE(expires_at,now()+interval '24 hours') ELSE NULL END WHERE id=$8`,
      [next.entry_type,next.title,next.description,next.visit_date,next.visibility,input.markerIconCode??'pin',next.comments_enabled,id]);
    return getVisibleEntry(id,request.user.sub);
  });

  app.delete('/entries/:id', { preHandler: requireUser }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await pool.query('UPDATE map_entries SET deleted_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id', [id,request.user.sub]);
    if (!result.rows[0]) return reply.code(404).send({ code: 'ENTRY_NOT_FOUND', message: 'Отметка не найдена' }); return reply.code(204).send();
  });

  app.post('/entries/:id/convert-to-visited', { preHandler: requireUser }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const body = z.object({ visitDate: z.string().date().default(new Date().toISOString().slice(0,10)) }).parse(request.body ?? {});
    const result = await pool.query(`UPDATE map_entries SET entry_type='VISITED',visit_date=$1 WHERE id=$2 AND user_id=$3 AND entry_type='WISHLIST' AND deleted_at IS NULL RETURNING id`, [body.visitDate,id,request.user.sub]);
    if (!result.rows[0]) return reply.code(409).send({ code: 'NOT_A_WISHLIST', message: 'Желание уже отмечено как посещённое' }); return getVisibleEntry(id,request.user.sub);
  });

  app.post('/entries/:id/view', { preHandler: requireUser }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const sessionId = String(request.headers['x-session-id'] ?? request.user.sub);
    const inserted = await pool.query(`INSERT INTO entry_views(map_entry_id,viewer_user_id,session_id) SELECT $1,$2,$3 WHERE EXISTS(
      SELECT 1 FROM map_entries e WHERE e.id=$1 AND e.deleted_at IS NULL AND pinory_entry_visible(e.user_id,e.visibility,$2) AND (e.entry_type<>'STORY' OR e.expires_at>now())) ON CONFLICT DO NOTHING RETURNING map_entry_id`, [id,request.user.sub,sessionId]);
    const current = inserted.rowCount
      ? await pool.query('UPDATE map_entries SET views_count=views_count+1 WHERE id=$1 RETURNING views_count', [id])
      : await pool.query(`SELECT views_count FROM map_entries e WHERE id=$1 AND e.deleted_at IS NULL AND pinory_entry_visible(e.user_id,e.visibility,$2) AND (e.entry_type<>'STORY' OR e.expires_at>now())`, [id,request.user.sub]);
    if (!current.rows[0]) return reply.code(404).send({ code: 'ENTRY_NOT_FOUND', message: 'Отметка не найдена или недоступна' });
    return { counted: Boolean(inserted.rowCount), viewsCount: Number(current.rows[0].views_count) };
  });

  app.get('/users/:id/stories', { preHandler: requireUser }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await pool.query(`${entrySelect} WHERE e.user_id=$1 AND e.entry_type='STORY' AND e.deleted_at IS NULL AND e.expires_at>now()
      AND u.is_blocked=false AND pinory_entry_visible(e.user_id,e.visibility,$2)
      AND EXISTS(SELECT 1 FROM map_entry_media em JOIN media m ON m.id=em.media_id WHERE em.map_entry_id=e.id AND m.deleted_at IS NULL)
      ORDER BY e.created_at ASC LIMIT 50`, [id,request.user.sub]);
    return { items: result.rows.map(serializeEntry) };
  });

  app.post('/entries/:id/media', { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const owned = await pool.query(`SELECT id FROM map_entries WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND (entry_type<>'STORY' OR expires_at>now())`, [id,request.user.sub]);
    if (!owned.rows[0]) return reply.code(404).send({ code: 'ENTRY_NOT_FOUND', message: 'Отметка не найдена' });
    const count = await pool.query('SELECT count(*)::int count FROM map_entry_media WHERE map_entry_id=$1', [id]);
    const files = request.files(); const uploaded: any[] = []; let position = Number(count.rows[0].count);
    for await (const file of files) {
      if (position >= 10) return reply.code(400).send({ code: 'MEDIA_LIMIT', message: 'К одной отметке можно добавить до 10 фотографий' });
      const data = await processAndUpload(await file.toBuffer(), file.mimetype, request.user.sub);
      const saved = await pool.query(`INSERT INTO media(owner_user_id,storage_key,original_url,large_url,medium_url,thumbnail_url,mime_type,width,height,size_bytes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [request.user.sub,data.storageKey,data.originalUrl,data.largeUrl,data.mediumUrl,data.thumbnailUrl,data.mimeType,data.width,data.height,data.sizeBytes]);
      await pool.query('INSERT INTO map_entry_media(map_entry_id,media_id,sort_order) VALUES($1,$2,$3)', [id,saved.rows[0].id,position++]); uploaded.push(saved.rows[0]);
    }
    return reply.code(201).send({ items: uploaded.map((m) => ({ id:m.id,originalUrl:m.original_url,mediumUrl:m.medium_url,thumbnailUrl:m.thumbnail_url,width:m.width,height:m.height })) });
  });

  app.delete('/entries/:id/media/:mediaId', { preHandler: requireUser }, async (request, reply) => {
    const p = z.object({ id:z.string().uuid(),mediaId:z.string().uuid() }).parse(request.params);
    const result = await pool.query(`UPDATE media SET deleted_at=now() WHERE id=$1 AND owner_user_id=$2 AND EXISTS(SELECT 1 FROM map_entry_media WHERE map_entry_id=$3 AND media_id=$1) RETURNING id`, [p.mediaId,request.user.sub,p.id]);
    if (!result.rows[0]) return reply.code(404).send({ code:'MEDIA_NOT_FOUND',message:'Фотография не найдена' }); return reply.code(204).send();
  });
};
