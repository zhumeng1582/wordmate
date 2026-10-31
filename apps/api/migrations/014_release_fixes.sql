-- Separate claim ownership from queue age; safe to apply to existing databases.
ALTER TABLE wordmate.checkin_share_images
 ADD COLUMN IF NOT EXISTS lease_until timestamptz,
 ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE wordmate.checkin_poster_background_pool
 ADD COLUMN IF NOT EXISTS lease_until timestamptz,
 ADD COLUMN IF NOT EXISTS lease_token uuid;

-- Repair public snapshots left behind by the previous archive implementation.
UPDATE wordmate.shared_wordbooks shared
 SET published=false,version=version+1,updated_at=now()
 WHERE published AND EXISTS (
  SELECT 1 FROM wordmate.wordbooks source
  WHERE source.id=shared.source_wordbook_id AND source.archived_at IS NOT NULL
 );
