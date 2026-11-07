CREATE TABLE IF NOT EXISTS wordmate.poem_tutor_transcriptions (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES wordmate.poem_sessions(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES wordmate.users(id), audio_sha256 varchar(64) NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed','uncertain')),
 result text, billing_id uuid NOT NULL REFERENCES wordmate.ai_calls(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wordmate.poem_message_audio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES wordmate.poem_messages(id) ON DELETE CASCADE,
 voice_id text NOT NULL, profile_key text NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed')), billing_id uuid REFERENCES wordmate.ai_calls(id), attempt_id uuid,
 content bytea CHECK(content IS NULL OR octet_length(content)<=2097152),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(message_id,voice_id,profile_key)
);
