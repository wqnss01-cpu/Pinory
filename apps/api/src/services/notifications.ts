import type { DbClient } from '../db.js';
import { pool } from '../db.js';
import { env } from '../env.js';

type Entity = 'ENTRY' | 'USER' | 'COLLECTION' | 'PROFILE';
type NotifyInput = { userId: string; actorUserId?: string | null; type: string; entityType?: Entity; entityId?: string | null; payload?: Record<string, unknown> };

const notificationText: Record<string, string> = {
  NEW_FOLLOWER: 'подписался на ваш атлас', MUTUAL_FOLLOW: 'теперь ваш друг в Pinory', NEW_COMMENT: 'оставил комментарий к вашему месту',
  WANT_HERE: 'хочет побывать в вашем месте', ALSO_VISITED: 'тоже был в вашем месте', ENTRY_LIKED: 'оценил ваше воспоминание',
  COLLECTION_SAVED: 'сохранил места из вашей подборки', COLLECTION_COMMENT: 'написал в обсуждении вашей подборки', COLLECTION_FOLLOWED: 'подписался на вашу подборку', COLLECTION_INVITE: 'пригласил вас в общую подборку',
  COMPANION_INVITE: 'пригласил подтвердить совместное воспоминание', COMPANION_CONFIRMED: 'подтвердил совместное воспоминание', MEMORY_MERGED: 'объединил воспоминания о месте',
};

function targetPath(input: NotifyInput) {
  if (input.entityType === 'ENTRY' && input.entityId) return `?entry=${encodeURIComponent(input.entityId)}`;
  if (input.entityType === 'COLLECTION' && input.entityId) return `?collection=${encodeURIComponent(input.entityId)}`;
  if ((input.entityType === 'USER' || input.entityType === 'PROFILE') && input.entityId) return `?profile=${encodeURIComponent(input.entityId)}`;
  return '';
}

async function deliverTelegram(notificationId: string, input: NotifyInput) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_MINI_APP_URL) return;
  const result = await pool.query(`SELECT target.telegram_user_id,u.display_name actor_name,s.telegram_notifications_enabled
    FROM users target LEFT JOIN users u ON u.id=$2 LEFT JOIN user_settings s ON s.user_id=target.id WHERE target.id=$1`, [input.userId,input.actorUserId??null]);
  const row = result.rows[0]; if (!row || row.telegram_notifications_enabled === false) return;
  const actor = row.actor_name ?? 'Кто-то'; const action = notificationText[input.type] ?? 'оставил новое событие в Pinory';
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
    chat_id:String(row.telegram_user_id), text:`✨ ${actor} ${action}.`, reply_markup:{inline_keyboard:[[{text:'Открыть в Pinory',web_app:{url:`${env.TELEGRAM_MINI_APP_URL.replace(/\/$/,'')}/${targetPath(input)}`}}]]},
  }), signal:AbortSignal.timeout(8000) }).catch(()=>null);
  if (response?.ok) await pool.query('UPDATE notifications SET telegram_sent_at=now() WHERE id=$1',[notificationId]);
}

export async function notifyUser(input: NotifyInput, client?: DbClient) {
  if (input.userId === input.actorUserId) return null;
  const db = client ?? pool;
  const result = await db.query(`INSERT INTO notifications(user_id,actor_user_id,type,entity_type,entity_id,payload_json)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[input.userId,input.actorUserId??null,input.type,input.entityType??null,input.entityId??null,JSON.stringify(input.payload??{})]);
  const id = result.rows[0].id as string;
  if (!client) queueMicrotask(()=>void deliverTelegram(id,input));
  return id;
}
