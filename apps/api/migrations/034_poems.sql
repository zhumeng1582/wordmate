-- Each child has one implicit library; poems never contribute to word check-ins.
CREATE TABLE IF NOT EXISTS wordmate.poems (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100),
 author text NOT NULL DEFAULT '' CHECK (length(author) <= 100),
 dynasty text NOT NULL DEFAULT '' CHECK (length(dynasty) <= 40),
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
 memorized_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poems_child_created ON wordmate.poems(child_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS wordmate.poem_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), poem_id uuid NOT NULL REFERENCES wordmate.poems(id) ON DELETE CASCADE,
 content_hash text NOT NULL, title text NOT NULL, author text NOT NULL, dynasty text NOT NULL, body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(poem_id,content_hash)
);
CREATE TABLE IF NOT EXISTS wordmate.poem_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES wordmate.poem_sessions(id) ON DELETE CASCADE,
 ordinal bigserial, role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL CHECK(length(content) BETWEEN 1 AND 3000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wordmate.poem_turns (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES wordmate.poem_sessions(id) ON DELETE CASCADE,
 question text, status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS poem_one_running ON wordmate.poem_turns(session_id) WHERE status='running';
CREATE TABLE IF NOT EXISTS wordmate.poem_audio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), poem_id uuid NOT NULL REFERENCES wordmate.poems(id) ON DELETE CASCADE,
 content_hash text NOT NULL, voice_id text NOT NULL, profile_key text NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed')), billing_id uuid REFERENCES wordmate.ai_calls(id),
 attempt_id uuid, content bytea CHECK(content IS NULL OR octet_length(content)<=2097152),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(poem_id,content_hash,voice_id,profile_key)
);
