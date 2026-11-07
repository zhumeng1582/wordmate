CREATE TABLE IF NOT EXISTS wordmate.word_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id),
 child_word_id uuid NOT NULL,
 word_version integer NOT NULL CHECK(word_version>0),
 sentence_id uuid,
 sentence_version integer CHECK(sentence_version>0),
 kind text NOT NULL CHECK(kind IN ('pronunciation','spelling','translation','example','example_pronunciation')),
 audio_id uuid,
 created_by uuid REFERENCES wordmate.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(child_word_id,child_id) REFERENCES wordmate.child_words(id,child_id),
 FOREIGN KEY(sentence_id,child_id) REFERENCES wordmate.sentences(id,child_id),
 FOREIGN KEY(audio_id,child_id) REFERENCES wordmate.audio_assets(id,child_id),
 CHECK((sentence_id IS NULL)=(sentence_version IS NULL)),
 CHECK((kind IN ('example','example_pronunciation'))=(sentence_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS word_feedback_child_time ON wordmate.word_feedback(child_id,created_at DESC);
