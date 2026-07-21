ALTER TYPE entry_type ADD VALUE IF NOT EXISTS 'STORY';

ALTER TABLE map_entries
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS entries_story_expiry_idx
  ON map_entries(expires_at DESC)
  WHERE deleted_at IS NULL;
