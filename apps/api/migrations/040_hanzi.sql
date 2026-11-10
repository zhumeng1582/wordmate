CREATE TABLE IF NOT EXISTS wordmate.hanzi (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 character text NOT NULL,
 pinyin text NOT NULL DEFAULT '',
 radical text NOT NULL DEFAULT '',
 strokes integer CHECK (strokes BETWEEN 1 AND 100),
 meaning text NOT NULL DEFAULT '',
 words text NOT NULL DEFAULT '',
 example text NOT NULL DEFAULT '',
 tags text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 learned_at timestamptz,
 important boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(child_id, character)
);
CREATE INDEX IF NOT EXISTS hanzi_child_created ON wordmate.hanzi(child_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_audio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hanzi_id uuid NOT NULL REFERENCES wordmate.hanzi(id) ON DELETE CASCADE,
 content_hash text NOT NULL, voice_id text NOT NULL, profile_key text NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed')), billing_id uuid REFERENCES wordmate.ai_calls(id),
 attempt_id uuid, content bytea CHECK(content IS NULL OR octet_length(content)<=2097152),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(hanzi_id,content_hash,voice_id,profile_key)
);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_import_jobs (
 id uuid PRIMARY KEY, child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES wordmate.users(id) ON DELETE CASCADE,
 input_hash text NOT NULL, source_name text, source_base64 text, raw_text text NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN ('queued','running','ready','failed','cancelled','saved')),
 error_code text, read_page integer NOT NULL DEFAULT 0, read_total integer NOT NULL DEFAULT 0,
 lease_id uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hanzi_import_jobs_child ON wordmate.hanzi_import_jobs(child_id,actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS hanzi_import_jobs_queue ON wordmate.hanzi_import_jobs(status,created_at);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hanzi_id uuid NOT NULL REFERENCES wordmate.hanzi(id) ON DELETE CASCADE,
 content_hash text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(hanzi_id,content_hash)
);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES wordmate.hanzi_sessions(id) ON DELETE CASCADE,
 ordinal bigserial, role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL CHECK(length(content) BETWEEN 1 AND 3000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_turns (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES wordmate.hanzi_sessions(id) ON DELETE CASCADE,
 question text NOT NULL, status text NOT NULL CHECK(status IN ('running','succeeded','failed')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hanzi_one_running ON wordmate.hanzi_turns(session_id) WHERE status='running';
CREATE TABLE IF NOT EXISTS wordmate.hanzi_message_audio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES wordmate.hanzi_messages(id) ON DELETE CASCADE,
 voice_id text NOT NULL, profile_key text NOT NULL, state text NOT NULL CHECK(state IN ('running','succeeded','failed')),
 billing_id uuid REFERENCES wordmate.ai_calls(id), attempt_id uuid, content bytea CHECK(content IS NULL OR octet_length(content)<=2097152),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(message_id,voice_id,profile_key)
);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_tutor_transcriptions (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES wordmate.hanzi_sessions(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES wordmate.users(id), audio_sha256 varchar(64) NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed','uncertain')),
 result text, billing_id uuid NOT NULL REFERENCES wordmate.ai_calls(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_import_ai (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES wordmate.users(id) ON DELETE CASCADE, child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 input_hash text NOT NULL, status text NOT NULL CHECK(status IN ('running','succeeded','failed')), result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
