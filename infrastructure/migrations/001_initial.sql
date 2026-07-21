CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN CREATE TYPE visibility AS ENUM ('PRIVATE','FOLLOWERS','PUBLIC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE entry_type AS ENUM ('VISITED','WISHLIST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE report_status AS ENUM ('OPEN','REVIEWING','RESOLVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_user_id bigint UNIQUE NOT NULL, telegram_username text,
  first_name text NOT NULL, last_name text, display_name text NOT NULL, bio text, avatar_url text, home_city text,
  language_code text NOT NULL DEFAULT 'ru', default_visibility visibility NOT NULL DEFAULT 'FOLLOWERS',
  is_blocked boolean NOT NULL DEFAULT false, is_onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_search_idx ON users USING gin ((coalesce(display_name,'') || ' ' || coalesce(telegram_username,'')) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, show_followers boolean NOT NULL DEFAULT true,
  show_following boolean NOT NULL DEFAULT true, show_statistics boolean NOT NULL DEFAULT true,
  notify_new_follower boolean NOT NULL DEFAULT true, notify_comments boolean NOT NULL DEFAULT true,
  notify_comment_replies boolean NOT NULL DEFAULT true, notify_collection_updates boolean NOT NULL DEFAULT true,
  notify_invites boolean NOT NULL DEFAULT true, telegram_notifications_enabled boolean NOT NULL DEFAULT true,
  location_features_enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid REFERENCES users(id) ON DELETE CASCADE, following_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (follower_id, following_id), CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows(following_id, created_at DESC);

CREATE TABLE IF NOT EXISTS place_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL, icon text NOT NULL,
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS marker_icons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL,
  category_id uuid REFERENCES place_categories(id), asset_url text NOT NULL, color_mode text NOT NULL DEFAULT 'AUTO',
  is_active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, normalized_name text NOT NULL, description text,
  category_id uuid REFERENCES place_categories(id), location geography(Point,4326) NOT NULL, radius_meters int NOT NULL DEFAULT 75,
  country_code text, country_name text, region text, city text, address text, external_provider text, external_id text,
  created_by_user_id uuid REFERENCES users(id), is_verified boolean NOT NULL DEFAULT false,
  popularity_score numeric(12,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS places_location_gix ON places USING gist(location);
CREATE INDEX IF NOT EXISTS places_name_trgm_idx ON places USING gin (normalized_name gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS places_external_unique ON places(external_provider, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES users(id), storage_key text UNIQUE NOT NULL,
  original_url text NOT NULL, large_url text NOT NULL, medium_url text NOT NULL, thumbnail_url text NOT NULL, mime_type text NOT NULL,
  width int NOT NULL, height int NOT NULL, size_bytes bigint NOT NULL, blur_hash text, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS map_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), place_id uuid NOT NULL REFERENCES places(id),
  entry_type entry_type NOT NULL, title text NOT NULL, description text, visit_date date, visibility visibility NOT NULL,
  marker_icon_id uuid REFERENCES marker_icons(id), cover_media_id uuid REFERENCES media(id), comments_enabled boolean NOT NULL DEFAULT true,
  views_count int NOT NULL DEFAULT 0, comments_count int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS entries_place_idx ON map_entries(place_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_user_idx ON map_entries(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_public_idx ON map_entries(visibility, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS map_entry_media (
  map_entry_id uuid REFERENCES map_entries(id) ON DELETE CASCADE, media_id uuid REFERENCES media(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0, PRIMARY KEY(map_entry_id, media_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL, description text,
  visibility visibility NOT NULL DEFAULT 'PUBLIC', cover_media_id uuid REFERENCES media(id), places_count int NOT NULL DEFAULT 0,
  followers_count int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS collections_search_idx ON collections USING gin ((title || ' ' || coalesce(description,'')) gin_trgm_ops);
CREATE TABLE IF NOT EXISTS collection_entries (
  collection_id uuid REFERENCES collections(id) ON DELETE CASCADE, map_entry_id uuid REFERENCES map_entries(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0, added_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(collection_id,map_entry_id)
);
CREATE TABLE IF NOT EXISTS collection_follows (
  collection_id uuid REFERENCES collections(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(collection_id,user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), map_entry_id uuid NOT NULL REFERENCES map_entries(id), user_id uuid NOT NULL REFERENCES users(id),
  parent_comment_id uuid REFERENCES comments(id), text text NOT NULL CHECK(char_length(text) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS comments_entry_idx ON comments(map_entry_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), actor_user_id uuid REFERENCES users(id),
  type text NOT NULL, entity_type text, entity_id uuid, payload_json jsonb NOT NULL DEFAULT '{}', is_read boolean NOT NULL DEFAULT false,
  telegram_sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_user_id uuid NOT NULL REFERENCES users(id), entity_type text NOT NULL,
  entity_id uuid NOT NULL, reason text NOT NULL, comment text, status report_status NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz, reviewed_by uuid REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inviter_user_id uuid NOT NULL REFERENCES users(id), invited_user_id uuid REFERENCES users(id),
  referral_code text UNIQUE NOT NULL, start_parameter text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz
);
CREATE TABLE IF NOT EXISTS entry_views (
  map_entry_id uuid REFERENCES map_entries(id) ON DELETE CASCADE, viewer_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  session_id text NOT NULL, view_date date NOT NULL DEFAULT current_date, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(map_entry_id, viewer_user_id, view_date)
);
CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), name text NOT NULL, properties jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, key text NOT NULL, route text NOT NULL, response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key,route)
);

CREATE OR REPLACE FUNCTION pinory_touch_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS users_touch ON users; CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION pinory_touch_updated_at();
DROP TRIGGER IF EXISTS entries_touch ON map_entries; CREATE TRIGGER entries_touch BEFORE UPDATE ON map_entries FOR EACH ROW EXECUTE FUNCTION pinory_touch_updated_at();
DROP TRIGGER IF EXISTS collections_touch ON collections; CREATE TRIGGER collections_touch BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION pinory_touch_updated_at();

CREATE OR REPLACE FUNCTION pinory_entry_visible(owner_id uuid, entry_visibility visibility, viewer_id uuid)
RETURNS boolean AS $$ SELECT owner_id=viewer_id OR entry_visibility='PUBLIC' OR (entry_visibility='FOLLOWERS' AND EXISTS(SELECT 1 FROM follows WHERE follower_id=viewer_id AND following_id=owner_id)) $$ LANGUAGE sql STABLE;
