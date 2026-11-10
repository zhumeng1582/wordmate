-- Poem and character check-ins are independent of the English check-in history.
CREATE TABLE IF NOT EXISTS wordmate.library_checkins (
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('poems','hanzi')),
 local_date date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(child_id,kind,local_date)
);
