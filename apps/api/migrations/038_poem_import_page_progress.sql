ALTER TABLE wordmate.poem_import_jobs ADD COLUMN IF NOT EXISTS read_page integer NOT NULL DEFAULT 0;
ALTER TABLE wordmate.poem_import_jobs ADD COLUMN IF NOT EXISTS read_total integer NOT NULL DEFAULT 0;
