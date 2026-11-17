CREATE TABLE IF NOT EXISTS wordmate.hanzi_review_cards (
 hanzi_id uuid PRIMARY KEY REFERENCES wordmate.hanzi(id) ON DELETE CASCADE,
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 scheduler_state jsonb NOT NULL,
 scheduler_version text NOT NULL,
 parameter_version text NOT NULL,
 state text NOT NULL,
 due_at timestamptz NOT NULL,
 last_review_at timestamptz NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE INDEX IF NOT EXISTS hanzi_review_due ON wordmate.hanzi_review_cards(child_id,due_at);
