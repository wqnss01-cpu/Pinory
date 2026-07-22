import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { pool } from '../db.js';
import { entrySelect, serializeEntry } from '../serializers.js';

const periodSchema=z.object({year:z.coerce.number().int().min(2000).max(2100).optional(),month:z.coerce.number().int().min(1).max(12).optional()});

export const atlasRoutes:FastifyPluginAsync=async(app)=>{
  app.get('/users/:id/atlas-summary',{preHandler:requireUser},async(request,reply)=>{
    const{id}=z.object({id:z.string().uuid()}).parse(request.params);const q=periodSchema.parse(request.query);
    const access=await pool.query(`SELECT u.home_city,ST_Y(u.home_location::geometry) home_lat,ST_X(u.home_location::geometry) home_lng,
      COALESCE(s.show_statistics,true) show_statistics FROM users u LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.id=$1 AND u.is_blocked=false`,[id]);
    if(!access.rows[0])return reply.code(404).send({code:'USER_NOT_FOUND',message:'Пользователь не найден'});
    if(id!==request.user.sub&&!access.rows[0].show_statistics)return reply.code(403).send({code:'STATS_PRIVATE',message:'Пользователь скрыл статистику'});
    const args:unknown[]=[id,q.year??null,q.month??null];
    const result=await pool.query(`WITH visited AS (
      SELECT e.id,e.visit_date,e.created_at,e.description,p.id place_id,p.city,p.country_name,p.category_id,p.location,
        lag(p.location) OVER(ORDER BY COALESCE(e.visit_date,e.created_at::date),e.created_at) previous_location
      FROM map_entries e JOIN places p ON p.id=e.place_id
      WHERE e.user_id=$1 AND e.entry_type='VISITED' AND e.deleted_at IS NULL
        AND ($2::int IS NULL OR EXTRACT(YEAR FROM COALESCE(e.visit_date,e.created_at::date))=$2)
        AND ($3::int IS NULL OR EXTRACT(MONTH FROM COALESCE(e.visit_date,e.created_at::date))=$3)
    ), totals AS (SELECT count(*)::int places,count(DISTINCT city) FILTER(WHERE city IS NOT NULL)::int cities,count(DISTINCT country_name) FILTER(WHERE country_name IS NOT NULL)::int countries,
      COALESCE(round(sum(CASE WHEN previous_location IS NULL THEN 0 ELSE ST_Distance(location,previous_location) END)/1000)::int,0) distance_km FROM visited),
    favorite AS (SELECT COALESCE(pc.name,'Другое') name,count(*)::int count FROM visited v LEFT JOIN place_categories pc ON pc.id=v.category_id GROUP BY pc.name ORDER BY count DESC LIMIT 1),
    farthest AS (SELECT v.id,p.name,round(ST_Distance(v.location,u.home_location)/1000)::int distance_km FROM visited v JOIN places p ON p.id=v.place_id JOIN users u ON u.id=$1 WHERE u.home_location IS NOT NULL ORDER BY ST_Distance(v.location,u.home_location) DESC LIMIT 1)
    SELECT t.*,f.name favorite_category,f.count favorite_count,CASE WHEN fa.id IS NULL THEN NULL ELSE to_jsonb(fa) END farthest FROM totals t LEFT JOIN favorite f ON true LEFT JOIN farthest fa ON true`,args);
    const memories=await pool.query(`${entrySelect} WHERE e.user_id=$1 AND e.entry_type='VISITED' AND e.deleted_at IS NULL AND e.visit_date IS NOT NULL
      AND EXTRACT(MONTH FROM e.visit_date)=EXTRACT(MONTH FROM current_date) AND EXTRACT(DAY FROM e.visit_date)=EXTRACT(DAY FROM current_date)
      AND e.visit_date<current_date-interval '300 days' AND pinory_entry_visible(e.user_id,e.visibility,$2) ORDER BY e.visit_date DESC LIMIT 6`,[id,request.user.sub]);
    return{...result.rows[0],homeCity:access.rows[0].home_city,year:q.year??null,month:q.month??null,onThisDay:memories.rows.map(serializeEntry)};
  });

  app.get('/users/:id/compare',{preHandler:requireUser},async(request,reply)=>{
    const{id}=z.object({id:z.string().uuid()}).parse(request.params);if(id===request.user.sub)return reply.code(400).send({code:'SELF_COMPARE',message:'Выберите профиль друга'});
    const relation=await pool.query(`SELECT 1 FROM follows a JOIN follows b ON b.follower_id=a.following_id AND b.following_id=a.follower_id WHERE a.follower_id=$1 AND a.following_id=$2`,[request.user.sub,id]);
    if(!relation.rows[0])return reply.code(403).send({code:'FRIENDS_ONLY',message:'Сравнение доступно взаимным друзьям'});
    const result=await pool.query(`WITH mine AS(SELECT DISTINCT place_id,entry_type FROM map_entries WHERE user_id=$1 AND deleted_at IS NULL AND entry_type<>'STORY'),theirs AS(SELECT DISTINCT place_id,entry_type FROM map_entries WHERE user_id=$2 AND deleted_at IS NULL AND entry_type<>'STORY')
      SELECT p.id,p.name,p.city,p.country_name,ST_Y(p.location::geometry) lat,ST_X(p.location::geometry) lng,
      EXISTS(SELECT 1 FROM mine WHERE place_id=p.id AND entry_type='VISITED') mine_visited,EXISTS(SELECT 1 FROM theirs WHERE place_id=p.id AND entry_type='VISITED') theirs_visited,
      EXISTS(SELECT 1 FROM mine WHERE place_id=p.id AND entry_type='WISHLIST') mine_want,EXISTS(SELECT 1 FROM theirs WHERE place_id=p.id AND entry_type='WISHLIST') theirs_want
      FROM places p WHERE EXISTS(SELECT 1 FROM mine WHERE place_id=p.id) OR EXISTS(SELECT 1 FROM theirs WHERE place_id=p.id) LIMIT 500`,[request.user.sub,id]);
    const place=(r:any)=>({id:r.id,name:r.name,city:r.city,countryName:r.country_name,coordinates:{lat:Number(r.lat),lng:Number(r.lng)}});const rows=result.rows;
    return{commonVisited:rows.filter(r=>r.mine_visited&&r.theirs_visited).map(place),onlyMine:rows.filter(r=>r.mine_visited&&!r.theirs_visited).map(place),onlyTheirs:rows.filter(r=>!r.mine_visited&&r.theirs_visited).map(place),commonWishlist:rows.filter(r=>r.mine_want&&r.theirs_want).map(place),together:rows.filter(r=>(r.mine_want&&r.theirs_want)||(r.mine_want&&r.theirs_visited)||(r.theirs_want&&r.mine_visited)).map(place)};
  });

  app.get('/pulse/weekly',{preHandler:requireUser},async(request)=>{
    const result=await pool.query(`WITH friends AS(SELECT following_id id FROM follows f WHERE follower_id=$1 AND EXISTS(SELECT 1 FROM follows b WHERE b.follower_id=f.following_id AND b.following_id=$1)),fresh AS(SELECT e.*,p.city FROM map_entries e JOIN places p ON p.id=e.place_id JOIN friends f ON f.id=e.user_id WHERE e.deleted_at IS NULL AND e.created_at>now()-interval '7 days') SELECT count(*)::int friend_places,count(DISTINCT user_id)::int active_friends,count(DISTINCT city) FILTER(WHERE city IS NOT NULL)::int cities FROM fresh`,[request.user.sub]);
    const matches=await pool.query(`SELECT count(DISTINCT mine.place_id)::int count FROM map_entries mine JOIN map_entries friend ON friend.place_id=mine.place_id JOIN follows f ON f.following_id=friend.user_id AND f.follower_id=$1 WHERE mine.user_id=$1 AND mine.entry_type='WISHLIST' AND friend.entry_type='VISITED' AND mine.deleted_at IS NULL AND friend.deleted_at IS NULL AND friend.created_at>now()-interval '7 days'`,[request.user.sub]);
    return{...result.rows[0],wishlistMatches:Number(matches.rows[0].count)};
  });
};
