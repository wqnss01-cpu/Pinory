ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_location geography(Point,4326),
  ADD COLUMN IF NOT EXISTS quick_start_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_digest_sent_at timestamptz;

-- Existing atlases have already delivered their first value; quick start is for new accounts.
UPDATE users SET quick_start_completed=true WHERE is_onboarding_completed=true;

CREATE TABLE IF NOT EXISTS entry_reactions (
  map_entry_id uuid NOT NULL REFERENCES map_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('WANT_HERE','ALSO_VISITED','LIKE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_entry_id,user_id,reaction_type)
);
CREATE INDEX IF NOT EXISTS entry_reactions_user_idx ON entry_reactions(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS entry_companions (
  map_entry_id uuid NOT NULL REFERENCES map_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','DECLINED')),
  created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
  PRIMARY KEY (map_entry_id,user_id)
);
CREATE INDEX IF NOT EXISTS entry_companions_user_idx ON entry_companions(user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS memory_merges (
  target_entry_id uuid NOT NULL REFERENCES map_entries(id) ON DELETE CASCADE,
  source_entry_id uuid NOT NULL REFERENCES map_entries(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(target_entry_id,source_entry_id),
  CHECK(target_entry_id<>source_entry_id)
);

CREATE TABLE IF NOT EXISTS collection_members (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'EDITOR' CHECK(role IN ('EDITOR','VIEWER')),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz,
  PRIMARY KEY(collection_id,user_id)
);
CREATE INDEX IF NOT EXISTS collection_members_user_idx ON collection_members(user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS collection_votes (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  map_entry_id uuid NOT NULL REFERENCES map_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(collection_id,map_entry_id,user_id)
);

CREATE TABLE IF NOT EXISTS collection_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text text NOT NULL CHECK(char_length(text) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS collection_comments_idx ON collection_comments(collection_id,created_at);

CREATE INDEX IF NOT EXISTS entries_user_visit_date_idx
  ON map_entries(user_id,visit_date DESC) WHERE deleted_at IS NULL AND entry_type='VISITED';
CREATE INDEX IF NOT EXISTS entries_place_user_type_idx
  ON map_entries(place_id,user_id,entry_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_telegram_queue_idx
  ON notifications(telegram_sent_at,created_at) WHERE telegram_sent_at IS NULL;
