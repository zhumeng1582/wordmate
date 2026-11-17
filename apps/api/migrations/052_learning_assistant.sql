SET search_path TO wordmate,public;
CREATE TABLE IF NOT EXISTS learning_assistant_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tutor_session_id uuid UNIQUE REFERENCES word_tutor_sessions(id) ON DELETE CASCADE, child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
 state jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_assistant_child ON learning_assistant_sessions(child_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS learning_assistant_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES learning_assistant_sessions(id) ON DELETE CASCADE,
 ordinal bigserial, role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_assistant_messages_session ON learning_assistant_messages(session_id,ordinal);
CREATE TABLE IF NOT EXISTS learning_assistant_turns (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES learning_assistant_sessions(id) ON DELETE CASCADE,
 request jsonb NOT NULL, status text NOT NULL CHECK(status IN ('running','succeeded','failed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS learning_assistant_one_running ON learning_assistant_turns(session_id) WHERE status='running';
CREATE TABLE IF NOT EXISTS learning_assistant_audio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES learning_assistant_messages(id) ON DELETE CASCADE,
 voice_id text NOT NULL, accent text NOT NULL CHECK(accent IN ('en-GB','en-US')), profile_key text NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed')), billing_id uuid REFERENCES ai_calls(id),
 content bytea, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(content IS NULL OR octet_length(content)<=2097152),
 UNIQUE(message_id,voice_id,accent,profile_key)
);

ALTER TABLE learning_assistant_audio ADD COLUMN IF NOT EXISTS attempt_id uuid;


ALTER TABLE word_tutor_messages ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
