CREATE TABLE IF NOT EXISTS wordmate.admin_feedback_actions (
 id bigserial PRIMARY KEY,
 word_feedback_id uuid REFERENCES wordmate.word_feedback(id) ON DELETE CASCADE,
 audio_feedback_id uuid REFERENCES wordmate.audio_feedback(id) ON DELETE CASCADE,
 tutor_event_id uuid REFERENCES wordmate.word_tutor_learning_events(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('pending','in_progress','resolved','dismissed')),
 note varchar(500) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((word_feedback_id IS NOT NULL)::integer + (audio_feedback_id IS NOT NULL)::integer + (tutor_event_id IS NOT NULL)::integer = 1)
);
CREATE INDEX IF NOT EXISTS admin_feedback_actions_word ON wordmate.admin_feedback_actions(word_feedback_id,id DESC) WHERE word_feedback_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_feedback_actions_audio ON wordmate.admin_feedback_actions(audio_feedback_id,id DESC) WHERE audio_feedback_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_feedback_actions_tutor ON wordmate.admin_feedback_actions(tutor_event_id,id DESC) WHERE tutor_event_id IS NOT NULL;
