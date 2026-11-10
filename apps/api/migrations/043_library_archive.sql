-- Reversible library archive is independent of deletion and review suspension.
ALTER TABLE IF EXISTS wordmate.child_words ADD COLUMN IF NOT EXISTS library_archived_at timestamptz;
ALTER TABLE IF EXISTS wordmate.poems ADD COLUMN IF NOT EXISTS library_archived_at timestamptz;
ALTER TABLE IF EXISTS wordmate.hanzi ADD COLUMN IF NOT EXISTS library_archived_at timestamptz;
