DO $$ BEGIN CREATE TYPE location_source AS ENUM ('TELEGRAM_LIVE_LOCATION','ANDROID_APP','MINIAPP_FOREGROUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS location_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), source location_source NOT NULL,
  status text NOT NULL, started_at timestamptz NOT NULL, stopped_at timestamptz, telegram_chat_id bigint, telegram_message_id bigint,
  device_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS location_samples (
  id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), session_id uuid NOT NULL REFERENCES location_sessions(id),
  location geography(Point,4326) NOT NULL, accuracy_meters real, altitude real, speed real, heading real,
  recorded_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS location_samples_gix ON location_samples USING gist(location);
CREATE INDEX IF NOT EXISTS location_samples_user_time ON location_samples(user_id, recorded_at DESC);
CREATE TABLE IF NOT EXISTS visit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), place_id uuid NOT NULL REFERENCES places(id),
  entry_id uuid REFERENCES map_entries(id), entered_at timestamptz NOT NULL, confirmed_at timestamptz, left_at timestamptz,
  duration_seconds int, source location_source NOT NULL, confidence real, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS place_visit_counters (
  user_id uuid REFERENCES users(id), place_id uuid REFERENCES places(id), visits_count int NOT NULL DEFAULT 0,
  first_visit_at timestamptz, last_visit_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,place_id)
);
