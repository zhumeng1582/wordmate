CREATE TABLE IF NOT EXISTS wordmate.poem_import_jobs (
 id uuid PRIMARY KEY, child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES wordmate.users(id) ON DELETE CASCADE,
 input_hash text NOT NULL, raw_text text NOT NULL, source_name text, source_base64 text, chunks jsonb NOT NULL, request_ids jsonb NOT NULL, results jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL CHECK(status IN ('queued','running','ready','failed','saved')),
 saved_count integer, saved_hash text, error_code text, lease_id uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poem_import_jobs_child ON wordmate.poem_import_jobs(child_id,actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS poem_import_jobs_queue ON wordmate.poem_import_jobs(status,created_at);
