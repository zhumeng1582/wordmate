CREATE TABLE IF NOT EXISTS wordmate.hanzi_monthly_quizzes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 created_by uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 month date NOT NULL,
 timezone_snapshot text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('sample','full')),
 eligible_count integer NOT NULL CHECK(eligible_count>0),
 status text NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','abandoned')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz,
 submitted_local_date date
);
CREATE UNIQUE INDEX IF NOT EXISTS hanzi_monthly_quiz_active ON wordmate.hanzi_monthly_quizzes(child_id) WHERE status='in_progress';
CREATE TABLE IF NOT EXISTS wordmate.hanzi_monthly_quiz_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 quiz_id uuid NOT NULL REFERENCES wordmate.hanzi_monthly_quizzes(id) ON DELETE CASCADE,
 hanzi_id uuid NOT NULL,
 ordinal integer NOT NULL,
 character_snapshot text NOT NULL,
 options jsonb NOT NULL,
 correct_answer text NOT NULL,
 selected_answer text,
 answer_version integer NOT NULL DEFAULT 1,
 event_id uuid NOT NULL DEFAULT gen_random_uuid(),
 UNIQUE(quiz_id,ordinal), UNIQUE(quiz_id,hanzi_id)
);
CREATE INDEX IF NOT EXISTS hanzi_monthly_quizzes_child ON wordmate.hanzi_monthly_quizzes(child_id,created_at DESC);
