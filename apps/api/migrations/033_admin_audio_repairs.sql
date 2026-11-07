CREATE TABLE IF NOT EXISTS wordmate.admin_audio_repairs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id),
 audio_id uuid NOT NULL REFERENCES wordmate.audio_assets(id) ON DELETE CASCADE,
 word_feedback_id uuid REFERENCES wordmate.word_feedback(id) ON DELETE SET NULL,
 audio_feedback_id uuid REFERENCES wordmate.audio_feedback(id) ON DELETE SET NULL,
 status text NOT NULL CHECK(status IN ('generating','ready','applied','failed')),
 voice_id text NOT NULL, accent text NOT NULL CHECK(accent IN ('en-GB','en-US')),
 original_sha256 text NOT NULL, content_version integer NOT NULL,
 audio_bytes bytea CHECK(audio_bytes IS NULL OR octet_length(audio_bytes)<=10485760),
 sha256 text, old_storage_profile_id text, old_storage_key text,
 new_storage_profile_id text NOT NULL, new_storage_key text NOT NULL,
 error_code text, created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_audio_repairs_audio ON wordmate.admin_audio_repairs(audio_id,created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audio_repairs_child ON wordmate.admin_audio_repairs(child_id);
CREATE UNIQUE INDEX IF NOT EXISTS admin_audio_repairs_one_generation ON wordmate.admin_audio_repairs(audio_id) WHERE status='generating';
