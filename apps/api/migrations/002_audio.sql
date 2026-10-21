-- Additive and idempotent: preserves all existing learning data.
ALTER TABLE wordmate.audio_assets ADD COLUMN IF NOT EXISTS storage_profile_id text;
ALTER TABLE wordmate.audio_assets ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE wordmate.audio_assets ADD COLUMN IF NOT EXISTS size_bytes integer;
CREATE TABLE IF NOT EXISTS wordmate.audio_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL REFERENCES wordmate.generation_jobs(id),
 child_id uuid NOT NULL REFERENCES wordmate.children(id),
 actor_id uuid NOT NULL REFERENCES wordmate.users(id),
 attempt integer NOT NULL CHECK(attempt > 0),
 characters integer NOT NULL CHECK(characters BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL,
 UNIQUE(job_id,attempt)
);
CREATE INDEX IF NOT EXISTS audio_usage_child_time ON wordmate.audio_usage_events(child_id,created_at);
CREATE INDEX IF NOT EXISTS audio_usage_actor_time ON wordmate.audio_usage_events(actor_id,created_at);
