ALTER TABLE wordmate.wordbooks
 ADD COLUMN IF NOT EXISTS shared_source_id uuid,
 ADD COLUMN IF NOT EXISTS shared_source_version integer,
 ADD COLUMN IF NOT EXISTS read_only boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS wordmate.shared_wordbooks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_wordbook_id uuid NOT NULL,
 source_child_id uuid NOT NULL,
 publisher_user_id uuid NOT NULL REFERENCES wordmate.users(id),
 title varchar(60) NOT NULL,
 description varchar(300) NOT NULL DEFAULT '',
 target_level varchar(40) NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 published boolean NOT NULL DEFAULT false,
 word_count integer NOT NULL DEFAULT 0 CHECK(word_count >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_wordbook_id), UNIQUE(id,source_child_id),
 FOREIGN KEY(source_wordbook_id,source_child_id) REFERENCES wordmate.wordbooks(id,child_id)
);

CREATE TABLE IF NOT EXISTS wordmate.shared_wordbook_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shared_wordbook_id uuid NOT NULL REFERENCES wordmate.shared_wordbooks(id) ON DELETE CASCADE,
 ordinal integer NOT NULL CHECK(ordinal > 0),
 lemma varchar(120) NOT NULL,
 normalized_lemma varchar(120) NOT NULL,
 part_of_speech varchar(24) NOT NULL,
 sense_key text NOT NULL,
 meaning_zh varchar(500) NOT NULL,
 ipa_gb text,
 ipa_us text,
 example_en text,
 example_zh text,
 UNIQUE(shared_wordbook_id,ordinal),
 UNIQUE(shared_wordbook_id,normalized_lemma,part_of_speech,sense_key)
);

CREATE TABLE IF NOT EXISTS wordmate.shared_wordbook_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shared_wordbook_id uuid NOT NULL REFERENCES wordmate.shared_wordbooks(id),
 child_id uuid NOT NULL REFERENCES wordmate.children(id),
 local_wordbook_id uuid NOT NULL,
 shared_version integer NOT NULL,
 active boolean NOT NULL DEFAULT true,
 joined_by uuid NOT NULL REFERENCES wordmate.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(shared_wordbook_id,child_id),
 FOREIGN KEY(local_wordbook_id,child_id) REFERENCES wordmate.wordbooks(id,child_id)
);

ALTER TABLE wordmate.wordbooks DROP CONSTRAINT IF EXISTS wordbooks_shared_source_fk;
ALTER TABLE wordmate.wordbooks ADD CONSTRAINT wordbooks_shared_source_fk
 FOREIGN KEY(shared_source_id) REFERENCES wordmate.shared_wordbooks(id);
CREATE INDEX IF NOT EXISTS shared_wordbooks_public_search ON wordmate.shared_wordbooks(published,updated_at DESC);
CREATE INDEX IF NOT EXISTS shared_wordbook_subscriptions_child ON wordmate.shared_wordbook_subscriptions(child_id,active);
