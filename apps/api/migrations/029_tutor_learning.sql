SET search_path TO wordmate, public;
CREATE TABLE IF NOT EXISTS word_tutor_learning_events (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES word_tutor_sessions(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('lesson_opened','exercise_started','exercise_answered','exercise_completed','feedback_wrong','feedback_hard','feedback_unnatural')),
 message_id uuid REFERENCES word_tutor_messages(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS word_tutor_learning_events_session ON word_tutor_learning_events(session_id,kind);
