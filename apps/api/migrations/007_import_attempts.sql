CREATE TABLE IF NOT EXISTS wordmate.import_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES wordmate.users(id),
 child_id uuid NOT NULL REFERENCES wordmate.children(id),
 digest text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
 result_text text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_attempts_actor_date ON wordmate.import_attempts(actor_id,created_at);
