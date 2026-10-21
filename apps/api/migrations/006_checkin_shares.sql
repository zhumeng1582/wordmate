CREATE TABLE IF NOT EXISTS wordmate.checkin_share_quotes (
 child_id uuid NOT NULL REFERENCES wordmate.children(id),
 local_date date NOT NULL,
 requested_by uuid NOT NULL REFERENCES wordmate.users(id),
 quotes jsonb NOT NULL CHECK(jsonb_typeof(quotes)='array'),
 source text NOT NULL CHECK(source IN ('curated','ai')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(child_id,local_date)
);
CREATE INDEX IF NOT EXISTS checkin_share_quotes_budget ON wordmate.checkin_share_quotes(requested_by,created_at);
