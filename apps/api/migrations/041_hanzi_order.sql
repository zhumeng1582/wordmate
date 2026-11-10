ALTER TABLE wordmate.hanzi ADD COLUMN IF NOT EXISTS sort_order integer;
CREATE INDEX IF NOT EXISTS hanzi_child_sort_order ON wordmate.hanzi(child_id,sort_order,created_at DESC,id DESC);
