-- New learning records are separate from historical view check-ins.
CREATE TABLE IF NOT EXISTS wordmate.hanzi_learning_settings (
 child_id uuid PRIMARY KEY REFERENCES wordmate.children(id) ON DELETE CASCADE,
 daily_goal integer NOT NULL DEFAULT 10 CHECK (daily_goal BETWEEN 1 AND 500),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_daily_activity (
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 local_date date NOT NULL,
 goal_snapshot integer NOT NULL CHECK (goal_snapshot BETWEEN 1 AND 500),
 timezone_snapshot text NOT NULL,
 PRIMARY KEY (child_id,local_date)
);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_learning_events (
 event_id uuid PRIMARY KEY,
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 -- Preserve the day's learning count if an individual character is deleted.
 -- Child deletion still removes the entire history through child_id.
 hanzi_id uuid NOT NULL,
 actor_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 local_date date NOT NULL,
 kind text NOT NULL CHECK (kind IN ('learn','review','test')),
 correct boolean,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hanzi_events_child_date ON wordmate.hanzi_learning_events(child_id,local_date,hanzi_id);
