import type { FastifyPluginAsync,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { env } from '../env.js';
import { pool } from '../db.js';

async function requireAdmin(request:FastifyRequest){await requireUser(request);const ids=new Set(env.ADMIN_TELEGRAM_IDS.split(',').map((x)=>x.trim()).filter(Boolean));if(!ids.has(request.user.telegramUserId)&&env.NODE_ENV==='production'){const error=new Error('Недостаточно прав') as Error&{statusCode:number};error.statusCode=403;throw error;}}

export const adminRoutes:FastifyPluginAsync=async(app)=>{
  app.get('/admin/stats',{preHandler:requireAdmin},async()=>{const r=await pool.query(`SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM places) places,(SELECT count(*) FROM map_entries WHERE deleted_at IS NULL) entries,(SELECT count(*) FROM collections WHERE deleted_at IS NULL) collections,(SELECT count(*) FROM comments WHERE deleted_at IS NULL) comments,(SELECT count(*) FROM reports WHERE status='OPEN') open_reports`);return r.rows[0];});
  app.get('/admin/users',{preHandler:requireAdmin},async()=>({items:(await pool.query('SELECT id,telegram_user_id,display_name,telegram_username,is_blocked,created_at,last_seen_at FROM users ORDER BY created_at DESC LIMIT 200')).rows}));
  app.get('/admin/reports',{preHandler:requireAdmin},async()=>({items:(await pool.query('SELECT r.*,u.display_name reporter_name FROM reports r JOIN users u ON u.id=r.reporter_user_id ORDER BY r.created_at DESC LIMIT 200')).rows}));
  app.patch('/admin/users/:id/block',{preHandler:requireAdmin},async(request)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);const{blocked}=z.object({blocked:z.boolean()}).parse(request.body);await pool.query('UPDATE users SET is_blocked=$1 WHERE id=$2',[blocked,id]);return{ok:true};});
  app.delete('/admin/entries/:id',{preHandler:requireAdmin},async(request,reply)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);await pool.query('UPDATE map_entries SET deleted_at=now() WHERE id=$1',[id]);return reply.code(204).send();});
  app.delete('/admin/comments/:id',{preHandler:requireAdmin},async(request,reply)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);await pool.query('UPDATE comments SET deleted_at=now() WHERE id=$1',[id]);return reply.code(204).send();});
  app.patch('/admin/reports/:id',{preHandler:requireAdmin},async(request)=>{const{id}=z.object({id:z.string().uuid()}).parse(request.params);const{status}=z.object({status:z.enum(['OPEN','REVIEWING','RESOLVED','REJECTED'])}).parse(request.body);await pool.query('UPDATE reports SET status=$1::report_status,reviewed_at=CASE WHEN $1::report_status IN (\'RESOLVED\',\'REJECTED\') THEN now() ELSE reviewed_at END,reviewed_by=$2 WHERE id=$3',[status,request.user.sub,id]);return{ok:true};});
};
