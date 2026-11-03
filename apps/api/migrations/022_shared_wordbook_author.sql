ALTER TABLE wordmate.shared_wordbooks ADD COLUMN IF NOT EXISTS author varchar(60) NOT NULL DEFAULT '';
ALTER TABLE wordmate.shared_wordbook_items ADD COLUMN IF NOT EXISTS example_surface text;
ALTER TABLE wordmate.shared_wordbook_items ADD COLUMN IF NOT EXISTS example_start_utf16 integer;
ALTER TABLE wordmate.shared_wordbook_items ADD COLUMN IF NOT EXISTS example_end_utf16 integer;
