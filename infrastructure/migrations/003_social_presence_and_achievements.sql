CREATE INDEX IF NOT EXISTS location_sessions_active_user_idx
  ON location_sessions(user_id, started_at DESC)
  WHERE stopped_at IS NULL;

CREATE INDEX IF NOT EXISTS location_samples_session_time_idx
  ON location_samples(session_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_code text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_code)
);

CREATE INDEX IF NOT EXISTS user_achievements_unlocked_idx
  ON user_achievements(user_id, unlocked_at DESC);
