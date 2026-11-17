-- Sentences remain reusable audio/content resources; only explicitly added
-- sentence_library entries participate in sentence learning and check-ins.
CREATE TABLE IF NOT EXISTS wordmate.sentence_library (
 sentence_id uuid PRIMARY KEY,child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 normalized_en text NOT NULL,notes text NOT NULL DEFAULT '',favorite boolean NOT NULL DEFAULT false,
 archived_at timestamptz,version integer NOT NULL DEFAULT 1,
 order_key numeric NOT NULL DEFAULT (extract(epoch FROM clock_timestamp())*1000000000+nextval('wordmate.library_order_sequence')::numeric/1000000000),
 UNIQUE(sentence_id,child_id),UNIQUE(child_id,normalized_en),
 FOREIGN KEY(sentence_id,child_id) REFERENCES wordmate.sentences(id,child_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS wordmate.sentence_books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60),is_default boolean NOT NULL DEFAULT false,
 read_only boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,child_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sentence_default_book ON wordmate.sentence_books(child_id) WHERE is_default AND archived_at IS NULL;
CREATE TABLE IF NOT EXISTS wordmate.sentence_book_items (
 book_id uuid NOT NULL,child_id uuid NOT NULL,sentence_id uuid NOT NULL,
 order_key numeric NOT NULL DEFAULT (extract(epoch FROM clock_timestamp())*1000000000+nextval('wordmate.library_order_sequence')::numeric/1000000000),
 PRIMARY KEY(book_id,sentence_id),FOREIGN KEY(book_id,child_id) REFERENCES wordmate.sentence_books(id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(sentence_id,child_id) REFERENCES wordmate.sentence_library(sentence_id,child_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS wordmate.sentence_cards (
 sentence_id uuid PRIMARY KEY,child_id uuid NOT NULL,state text NOT NULL DEFAULT 'new',scheduler_state jsonb NOT NULL,
 scheduler_version text NOT NULL,parameter_version text NOT NULL,due_at timestamptz NOT NULL,
 version integer NOT NULL DEFAULT 1,last_review_at timestamptz,
 FOREIGN KEY(sentence_id,child_id) REFERENCES wordmate.sentence_library(sentence_id,child_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sentence_due ON wordmate.sentence_cards(child_id,state,due_at);
CREATE TABLE IF NOT EXISTS wordmate.sentence_learning_settings (
 child_id uuid PRIMARY KEY REFERENCES wordmate.children(id) ON DELETE CASCADE,daily_goal integer NOT NULL DEFAULT 5 CHECK(daily_goal BETWEEN 1 AND 100),version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS wordmate.sentence_daily_activity (
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,local_date date NOT NULL,
 goal_snapshot integer NOT NULL CHECK(goal_snapshot BETWEEN 1 AND 100),timezone_snapshot text NOT NULL,
 PRIMARY KEY(child_id,local_date)
);
CREATE TABLE IF NOT EXISTS wordmate.sentence_daily_items (
 child_id uuid NOT NULL,local_date date NOT NULL,sentence_id uuid NOT NULL,was_new boolean NOT NULL,
 PRIMARY KEY(child_id,local_date,sentence_id),FOREIGN KEY(child_id,local_date) REFERENCES wordmate.sentence_daily_activity(child_id,local_date) ON DELETE CASCADE,
 FOREIGN KEY(sentence_id,child_id) REFERENCES wordmate.sentence_library(sentence_id,child_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS wordmate.sentence_study_rounds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,book_id uuid REFERENCES wordmate.sentence_books(id) ON DELETE SET NULL,
 source text NOT NULL CHECK(source IN ('new','review','favorite','wrong','history')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','ended')),
 lease_id uuid NOT NULL DEFAULT gen_random_uuid(),lease_until timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sentence_one_active_round ON wordmate.sentence_study_rounds(child_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS wordmate.sentence_study_items (
 round_id uuid NOT NULL REFERENCES wordmate.sentence_study_rounds(id) ON DELETE CASCADE,ordinal integer NOT NULL,sentence_id uuid NOT NULL REFERENCES wordmate.sentence_library(sentence_id) ON DELETE CASCADE,
 text_en text NOT NULL,translation_zh text NOT NULL,content_version integer NOT NULL,card_version integer NOT NULL,
 revealed boolean NOT NULL DEFAULT false,rating text CHECK(rating IN ('again','hard','good')),event_id uuid,
 PRIMARY KEY(round_id,ordinal),UNIQUE(round_id,sentence_id)
);
CREATE TABLE IF NOT EXISTS wordmate.sentence_review_events (
 event_id uuid PRIMARY KEY,child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 sentence_id uuid NOT NULL REFERENCES wordmate.sentence_library(sentence_id) ON DELETE CASCADE,
 round_id uuid NOT NULL REFERENCES wordmate.sentence_study_rounds(id) ON DELETE CASCADE,ordinal integer NOT NULL,
 actor_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,rating text NOT NULL,
 local_date date NOT NULL,reviewed_at timestamptz NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,
 response jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS sentence_history ON wordmate.sentence_review_events(child_id,local_date,sentence_id);
CREATE TABLE IF NOT EXISTS wordmate.sentence_makeup_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 streak_start date NOT NULL,milestone_days integer NOT NULL,milestone_date date NOT NULL,
 used_for_date date,used_at timestamptz,used_by uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 UNIQUE(child_id,streak_start,milestone_days),UNIQUE(child_id,used_for_date)
);
CREATE TABLE IF NOT EXISTS wordmate.shared_sentence_books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_book_id uuid NOT NULL UNIQUE REFERENCES wordmate.sentence_books(id) ON DELETE CASCADE,
 source_child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,publisher_user_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 title text NOT NULL,author text NOT NULL,description text NOT NULL DEFAULT '',published boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wordmate.shared_sentence_book_items (
 shared_book_id uuid NOT NULL REFERENCES wordmate.shared_sentence_books(id) ON DELETE CASCADE,ordinal integer NOT NULL,
 text_en text NOT NULL,translation_zh text NOT NULL,PRIMARY KEY(shared_book_id,ordinal)
);
CREATE TABLE IF NOT EXISTS wordmate.shared_sentence_book_joins (
 shared_book_id uuid NOT NULL REFERENCES wordmate.shared_sentence_books(id) ON DELETE CASCADE,
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,local_book_id uuid NOT NULL REFERENCES wordmate.sentence_books(id) ON DELETE CASCADE,
 PRIMARY KEY(shared_book_id,child_id)
);
CREATE TABLE IF NOT EXISTS wordmate.sentence_import_jobs (
 id uuid PRIMARY KEY,child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,book_id uuid REFERENCES wordmate.sentence_books(id) ON DELETE SET NULL,
 input_hash text NOT NULL,raw_text text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','ready','saved','failed','cancelled')),
 result jsonb NOT NULL DEFAULT '[]',error_code text,lease_id uuid,lease_until timestamptz,
 saved_count integer NOT NULL DEFAULT 0,skipped_count integer NOT NULL DEFAULT 0,save_hash text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wordmate.import_records DROP CONSTRAINT IF EXISTS import_records_kind_check;
ALTER TABLE wordmate.import_records ADD CONSTRAINT import_records_kind_check CHECK(kind IN ('words','poems','hanzi','sentences'));
