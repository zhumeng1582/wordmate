CREATE TABLE IF NOT EXISTS wordmate.poem_import_ai (
 id uuid PRIMARY KEY, child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES wordmate.users(id) ON DELETE CASCADE,
 input_hash text NOT NULL, status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poem_import_ai_created ON wordmate.poem_import_ai(created_at);
