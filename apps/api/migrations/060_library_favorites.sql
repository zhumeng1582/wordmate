-- Child study marks belong to the child's local copy, never the shared source.
ALTER TABLE IF EXISTS wordmate.poems ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS wordmate.hanzi ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS poems_favorite_by_child ON wordmate.poems(child_id) WHERE favorite;
CREATE INDEX IF NOT EXISTS hanzi_favorite_by_child ON wordmate.hanzi(child_id) WHERE favorite;
