import type { DbClient } from '../db.js';

export interface TelegramIdentity {
  id: string | number;
  firstName: string;
  lastName?: string | null | undefined;
  username?: string | null | undefined;
  photoUrl?: string | null | undefined;
  languageCode?: string | null | undefined;
}

export async function upsertTelegramUser(client: DbClient, telegram: TelegramIdentity, referral?: string) {
  const displayName = [telegram.firstName, telegram.lastName].filter(Boolean).join(' ');
  const result = await client.query(
    `INSERT INTO users(telegram_user_id,telegram_username,first_name,last_name,display_name,avatar_url,language_code)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(telegram_user_id) DO UPDATE SET
       telegram_username=EXCLUDED.telegram_username,
       first_name=EXCLUDED.first_name,
       last_name=EXCLUDED.last_name,
       avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url),
       last_seen_at=now()
     RETURNING *`,
    [telegram.id, telegram.username ?? null, telegram.firstName, telegram.lastName ?? null, displayName, telegram.photoUrl ?? null, telegram.languageCode ?? 'ru'],
  );
  const row = result.rows[0];
  await client.query('INSERT INTO user_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING', [row.id]);
  await client.query(
    'INSERT INTO invitations(inviter_user_id,referral_code,start_parameter) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [row.id, `pin-${row.id.slice(0, 8)}`, `ref_${row.id.slice(0, 12)}`],
  );

  if (referral) {
    const invite = await client.query(
      'SELECT * FROM invitations WHERE start_parameter=$1 AND inviter_user_id<>$2',
      [referral, row.id],
    );
    if (invite.rows[0]) {
      await client.query(
        'UPDATE invitations SET invited_user_id=$1,accepted_at=now() WHERE id=$2 AND invited_user_id IS NULL',
        [row.id, invite.rows[0].id],
      );
      await client.query(
        `INSERT INTO notifications(user_id,actor_user_id,type,entity_type,entity_id,payload_json)
         VALUES($1,$2,'INVITE_ACCEPTED','USER',$2,$3)`,
        [invite.rows[0].inviter_user_id, row.id, JSON.stringify({ displayName: row.display_name })],
      );
    }
  }

  return row;
}
