SET search_path TO wordmate, public;
ALTER TABLE ai_calls DROP CONSTRAINT IF EXISTS ai_calls_kind_check;
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_kind_check CHECK(kind IN ('vocabulary','vision','connection_test','audio','word_tutor','tutor_asr','tutor_search','tutor_image'));
CREATE TABLE IF NOT EXISTS word_tutor_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES children(id),
 sense_key varchar(64) NOT NULL CHECK(sense_key ~ '^[a-f0-9]{64}$'),
 lemma varchar(120) NOT NULL,
 part_of_speech varchar(80) NOT NULL,
 meaning_zh varchar(500) NOT NULL,
 example_en text NOT NULL DEFAULT '', example_zh text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,child_id)
);
CREATE INDEX IF NOT EXISTS word_tutor_sessions_lookup ON word_tutor_sessions(child_id,sense_key,updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS word_tutor_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES word_tutor_sessions(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('user','assistant')),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 3000),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE word_tutor_messages ADD COLUMN IF NOT EXISTS ordinal bigserial;
CREATE INDEX IF NOT EXISTS word_tutor_messages_session ON word_tutor_messages(session_id,created_at,id);
CREATE TABLE IF NOT EXISTS word_tutor_turns (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES word_tutor_sessions(id) ON DELETE CASCADE,
 question text, status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS word_tutor_one_running ON word_tutor_turns(session_id) WHERE status='running';

CREATE TABLE IF NOT EXISTS word_tutor_transcriptions (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES word_tutor_sessions(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES users(id), audio_sha256 varchar(64) NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed','uncertain')),
 result text, billing_id uuid NOT NULL REFERENCES ai_calls(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS word_tutor_audio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES word_tutor_messages(id) ON DELETE CASCADE,
 voice_id text NOT NULL, accent text NOT NULL CHECK(accent IN ('en-GB','en-US')), profile_key text NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed')), billing_id uuid REFERENCES ai_calls(id),
 content bytea, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(content IS NULL OR octet_length(content)<=2097152),
 UNIQUE(message_id,voice_id,accent,profile_key)
);

ALTER TABLE word_tutor_audio ADD COLUMN IF NOT EXISTS attempt_id uuid;

ALTER TABLE word_tutor_messages ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE word_tutor_turns ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'chat';

CREATE TABLE IF NOT EXISTS word_tutor_images (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES word_tutor_sessions(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES users(id), message_id uuid REFERENCES word_tutor_messages(id) ON DELETE CASCADE,
 billing_id uuid NOT NULL REFERENCES ai_calls(id), state text NOT NULL CHECK(state IN ('running','succeeded','failed','uncertain')),
 content bytea, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(content IS NULL OR octet_length(content)<=5242880)
);
CREATE INDEX IF NOT EXISTS word_tutor_images_session ON word_tutor_images(session_id,created_at);
