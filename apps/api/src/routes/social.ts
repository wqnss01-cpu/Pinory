import type { FastifyPluginAsync } from 'fastify';
import { CreateCommentSchema, UpdateProfileSchema } from '@pinory/shared';
import { z } from 'zod';
import { pool, decodeCursor, encodeCursor } from '../db.js';
import { requireUser } from '../auth.js';
import { entrySelect, serializeEntry, serializeUser } from '../serializers.js';
import { notifyUser } from '../services/notifications.js';

const userSelect = `SELECT u.*,ST_Y(u.home_location::geometry) home_lat,ST_X(u.home_location::geometry) home_lng,COALESCE(us.show_statistics,true) show_statistics,COALESCE(us.show_followers,true) show_followers,COALESCE(us.show_following,true) show_following,
  EXISTS(SELECT 1 FROM follows WHERE follower_id=$2 AND following_id=u.id) is_following,
  EXISTS(SELECT 1 FROM follows a JOIN follows b ON b.follower_id=a.following_id AND b.following_id=a.follower_id WHERE a.follower_id=$2 AND a.following_id=u.id) is_friend,
  (SELECT count(*) FROM follows WHERE following_id=u.id) followers_count,(SELECT count(*) FROM follows WHERE follower_id=u.id) following_count,
  (SELECT count(*) FROM follows a JOIN follows b ON b.follower_id=a.following_id AND b.following_id=a.follower_id WHERE a.follower_id=u.id) friends_count,
  (SELECT count(*) FROM map_entries WHERE user_id=u.id AND entry_type='VISITED' AND deleted_at IS NULL) visited_count,
  (SELECT count(*) FROM map_entries WHERE user_id=u.id AND entry_type='WISHLIST' AND deleted_at IS NULL) wishlist_count,
  (SELECT count(*) FROM collections WHERE user_id=u.id AND deleted_at IS NULL) collections_count FROM users u LEFT JOIN user_settings us ON us.user_id=u.id`;

export const socialRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users/:id', { preHandler: requireUser }, async (request, reply) => {
    const { id } = z.object({ id:z.string().uuid() }).parse(request.params); const result = await pool.query(`${userSelect} WHERE u.id=$1 AND u.is_blocked=false`, [id,request.user.sub]);
    if (!result.rows[0]) return reply.code(404).send({code:'USER_NOT_FOUND',message:'Пользователь не найден'}); return serializeUser(result.rows[0],id===request.user.sub||result.rows[0].show_statistics);
  });
  app.patch('/users/me', { preHandler: requireUser }, async (request) => {
    const input=UpdateProfileSchema.parse(request.body); const current=await pool.query('SELECT * FROM users WHERE id=$1',[request.user.sub]); const row=current.rows[0];
    const result=await pool.query(`UPDATE users SET display_name=$1,bio=$2,home_city=$3,is_onboarding_completed=$4,default_visibility=$5,quick_start_completed=$6,home_location=CASE WHEN $7::double precision IS NULL THEN home_location ELSE ST_SetSRID(ST_MakePoint($8,$7),4326)::geography END WHERE id=$9 RETURNING *,ST_Y(home_location::geometry) home_lat,ST_X(home_location::geometry) home_lng`,
      [input.displayName??row.display_name,input.bio===undefined?row.bio:input.bio,input.homeCity===undefined?row.home_city:input.homeCity,input.isOnboardingCompleted??row.is_onboarding_completed,input.defaultVisibility??row.default_visibility,input.quickStartCompleted??row.quick_start_completed,input.homeCoordinates?.lat??null,input.homeCoordinates?.lng??null,request.user.sub]);
    return serializeUser(result.rows[0]);
  });
  app.get('/users/me/privacy',{preHandler:requireUser},async(request)=>{const result=await pool.query('SELECT show_statistics,show_followers,show_following FROM user_settings WHERE user_id=$1',[request.user.sub]);const row=result.rows[0]??{};return{showStatistics:row.show_statistics??true,showFollowers:row.show_followers??true,showFollowing:row.show_following??true};});
  app.patch('/users/me/privacy',{preHandler:requireUser},async(request)=>{const input=z.object({showStatistics:z.boolean()}).parse(request.body);await pool.query(`INSERT INTO user_settings(user_id,show_statistics) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET show_statistics=EXCLUDED.show_statistics,updated_at=now()`,[request.user.sub,input.showStatistics]);return{ok:true};});
  app.post('/users/:id/follow', { preHandler: requireUser, config:{rateLimit:{max:40,timeWindow:'1 hour'}} }, async (request,reply) => {
    const {id}=z.object({id:z.string().uuid()}).parse(request.params); if(id===request.user.sub)return reply.code(400).send({code:'SELF_FOLLOW',message:'Нельзя подписаться на себя'});
    const result=await pool.query('INSERT INTO follows(follower_id,following_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM users WHERE id=$2 AND is_blocked=false) ON CONFLICT DO NOTHING RETURNING following_id',[request.user.sub,id]);
    if(!result.rows[0])return {following:true};
    const mutual=await pool.query('SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',[id,request.user.sub]);
    await notifyUser({userId:id,actorUserId:request.user.sub,type:mutual.rowCount?'MUTUAL_FOLLOW':'NEW_FOLLOWER',entityType:'USER',entityId:request.user.sub});
    return {following:true,isFriend:Boolean(mutual.rowCount)};
  });
  app.delete('/users/:id/follow',{preHandler:requireUser},async(request,reply)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2',[request.user.sub,id]);return reply.code(204).send();});

  for(const kind of ['followers','following','friends'] as const) app.get(`/users/:id/${kind}`,{preHandler:requireUser},async(request)=>{
    const{id}=z.object({id:z.string().uuid()}).parse(request.params); const q=z.object({cursor:z.string().optional(),limit:z.coerce.number().min(1).max(50).default(20)}).parse(request.query);const cursor=decodeCursor(q.cursor);
    const relation=kind==='followers'
      ? 'FROM follows f JOIN users u ON f.follower_id=u.id AND f.following_id=$1'
      : kind==='following'
        ? 'FROM follows f JOIN users u ON f.following_id=u.id AND f.follower_id=$1'
        : `FROM follows f JOIN follows back ON back.follower_id=f.following_id AND back.following_id=f.follower_id JOIN users u ON u.id=f.following_id WHERE f.follower_id=$1`;
    const where=kind==='friends'?'AND':'WHERE';
    const result=await pool.query(`SELECT u.*,f.created_at,
      EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id=$4 AND mine.following_id=u.id) is_following,
      EXISTS(SELECT 1 FROM follows mine JOIN follows reciprocal ON reciprocal.follower_id=mine.following_id AND reciprocal.following_id=mine.follower_id WHERE mine.follower_id=$4 AND mine.following_id=u.id) is_friend
      ${relation} ${where} u.is_blocked=false AND ($2::timestamptz IS NULL OR f.created_at<$2) ORDER BY f.created_at DESC LIMIT $3`,[id,cursor,q.limit+1,request.user.sub]);
    const hasMore=result.rows.length>q.limit;const rows=result.rows.slice(0,q.limit);return{items:rows.map((r)=>serializeUser(r)),nextCursor:hasMore?encodeCursor(rows.at(-1).created_at):null};
  });

  for(const segment of ['map','entries'] as const) app.get(`/users/:id/${segment}`,{preHandler:requireUser},async(request)=>{
    const{id}=z.object({id:z.string().uuid()}).parse(request.params); const result=await pool.query(`${entrySelect} WHERE e.user_id=$1 AND e.deleted_at IS NULL AND e.entry_type<>'STORY' AND pinory_entry_visible(e.user_id,e.visibility,$2) ORDER BY e.created_at DESC LIMIT 200`,[id,request.user.sub]);return{items:result.rows.map(serializeEntry),nextCursor:null};
  });

  app.get('/entries/:id/comments',{preHandler:requireUser},async(request,reply)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);
    const visible=await pool.query('SELECT 1 FROM map_entries e WHERE e.id=$1 AND e.deleted_at IS NULL AND pinory_entry_visible(e.user_id,e.visibility,$2)',[id,request.user.sub]);if(!visible.rows[0])return reply.code(404).send({code:'ENTRY_NOT_FOUND',message:'Отметка недоступна'});
    const result=await pool.query(`SELECT c.*,u.display_name,u.avatar_url,u.telegram_username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.map_entry_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at ASC LIMIT 200`,[id]);
    return{items:result.rows.map((r)=>({id:r.id,text:r.text,parentCommentId:r.parent_comment_id,createdAt:r.created_at,author:{id:r.user_id,displayName:r.display_name,avatarUrl:r.avatar_url,telegramUsername:r.telegram_username}})),nextCursor:null};
  });
  app.post('/entries/:id/comments',{preHandler:requireUser,config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async(request,reply)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);const input=CreateCommentSchema.parse(request.body);
    const target=await pool.query('SELECT * FROM map_entries e WHERE e.id=$1 AND e.deleted_at IS NULL AND e.comments_enabled=true AND pinory_entry_visible(e.user_id,e.visibility,$2)',[id,request.user.sub]);if(!target.rows[0])return reply.code(404).send({code:'COMMENTS_UNAVAILABLE',message:'Комментарии недоступны'});
    if(input.parentCommentId){const parent=await pool.query('SELECT id FROM comments WHERE id=$1 AND map_entry_id=$2 AND deleted_at IS NULL',[input.parentCommentId,id]);if(!parent.rows[0])return reply.code(400).send({code:'PARENT_NOT_FOUND',message:'Исходный комментарий не найден'});}
    const result=await pool.query('INSERT INTO comments(map_entry_id,user_id,parent_comment_id,text) VALUES($1,$2,$3,$4) RETURNING *',[id,request.user.sub,input.parentCommentId??null,input.text]);await pool.query('UPDATE map_entries SET comments_count=comments_count+1 WHERE id=$1',[id]);
    if(target.rows[0].user_id!==request.user.sub)await notifyUser({userId:target.rows[0].user_id,actorUserId:request.user.sub,type:'NEW_COMMENT',entityType:'ENTRY',entityId:id,payload:{text:input.text.slice(0,120)}});return reply.code(201).send(result.rows[0]);
  });
  app.patch('/comments/:id',{preHandler:requireUser},async(request,reply)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);const{text}=z.object({text:z.string().trim().min(1).max(1000)}).parse(request.body);const result=await pool.query('UPDATE comments SET text=$1,updated_at=now() WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING *',[text,id,request.user.sub]);if(!result.rows[0])return reply.code(404).send({code:'COMMENT_NOT_FOUND',message:'Комментарий не найден'});return result.rows[0];});
  app.delete('/comments/:id',{preHandler:requireUser},async(request,reply)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);const result=await pool.query('UPDATE comments SET deleted_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING map_entry_id',[id,request.user.sub]);if(result.rows[0])await pool.query('UPDATE map_entries SET comments_count=greatest(0,comments_count-1) WHERE id=$1',[result.rows[0].map_entry_id]);return reply.code(204).send();});
  app.post('/comments/:id/report',{preHandler:requireUser},async(request,reply)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);const body=z.object({reason:z.string().min(2).max(80),comment:z.string().max(500).optional()}).parse(request.body);await pool.query(`INSERT INTO reports(reporter_user_id,entity_type,entity_id,reason,comment) VALUES($1,'COMMENT',$2,$3,$4)`,[request.user.sub,id,body.reason,body.comment??null]);return reply.code(201).send({ok:true});});

  app.get('/notifications',{preHandler:requireUser},async(request)=>{const result=await pool.query(`SELECT n.*,u.display_name actor_name,u.avatar_url actor_avatar FROM notifications n LEFT JOIN users u ON u.id=n.actor_user_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 100`,[request.user.sub]);return{items:result.rows,nextCursor:null};});
  app.patch('/notifications/:id/read',{preHandler:requireUser},async(request)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2',[id,request.user.sub]);return{ok:true};});
  app.post('/notifications/read-all',{preHandler:requireUser},async(request)=>{await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1',[request.user.sub]);return{ok:true};});
  app.post('/reports',{preHandler:requireUser},async(request,reply)=>{const body=z.object({entityType:z.enum(['ENTRY','PLACE','USER','COLLECTION']),entityId:z.string().uuid(),reason:z.string().min(2).max(80),comment:z.string().max(500).optional()}).parse(request.body);await pool.query('INSERT INTO reports(reporter_user_id,entity_type,entity_id,reason,comment) VALUES($1,$2,$3,$4,$5)',[request.user.sub,body.entityType,body.entityId,body.reason,body.comment??null]);return reply.code(201).send({ok:true});});
};
