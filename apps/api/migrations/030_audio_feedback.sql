CREATE TABLE IF NOT EXISTS wordmate.audio_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id),
 audio_id uuid NOT NULL,
 created_by uuid REFERENCES wordmate.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(audio_id,child_id) REFERENCES wordmate.audio_assets(id,child_id),
 UNIQUE(audio_id,created_by)
);
CREATE INDEX IF NOT EXISTS audio_feedback_child_time ON wordmate.audio_feedback(child_id,created_at DESC);
