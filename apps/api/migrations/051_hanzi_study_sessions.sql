CREATE TABLE IF NOT EXISTS wordmate.hanzi_study_rounds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 book_id uuid REFERENCES wordmate.hanzi_books(id) ON DELETE SET NULL,
 source text NOT NULL CHECK(source IN ('new','review','important','wrong','history')),
 status text NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','abandoned')),
 version integer NOT NULL DEFAULT 1, lease_id uuid, lease_owner uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 lease_until timestamptz, lease_generation integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hanzi_one_open_round ON wordmate.hanzi_study_rounds(child_id) WHERE status='in_progress';
CREATE TABLE IF NOT EXISTS wordmate.hanzi_study_round_items (
 round_id uuid NOT NULL REFERENCES wordmate.hanzi_study_rounds(id) ON DELETE CASCADE,
 ordinal integer NOT NULL, hanzi_id uuid NOT NULL,
 action text CHECK(action IN ('learn','review','skip')), correct boolean, event_id uuid, actor_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 PRIMARY KEY(round_id,ordinal), UNIQUE(round_id,hanzi_id), UNIQUE(event_id)
);
