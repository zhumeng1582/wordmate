CREATE TABLE IF NOT EXISTS wordmate.hanzi_books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 60), is_default boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,child_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS hanzi_one_default_book ON wordmate.hanzi_books(child_id) WHERE is_default AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hanzi_identity_child ON wordmate.hanzi(id,child_id);
CREATE TABLE IF NOT EXISTS wordmate.hanzi_book_items (
 book_id uuid NOT NULL, child_id uuid NOT NULL, hanzi_id uuid NOT NULL,
 PRIMARY KEY(book_id,hanzi_id),
 FOREIGN KEY(book_id,child_id) REFERENCES wordmate.hanzi_books(id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(hanzi_id,child_id) REFERENCES wordmate.hanzi(id,child_id) ON DELETE CASCADE
);
WITH created AS (INSERT INTO wordmate.hanzi_books(child_id,name,is_default)
 SELECT id,'我的汉字本',true FROM wordmate.children ON CONFLICT DO NOTHING RETURNING id,child_id)
INSERT INTO wordmate.hanzi_book_items(book_id,child_id,hanzi_id)
 SELECT b.id,h.child_id,h.id FROM wordmate.hanzi h JOIN created b ON b.child_id=h.child_id ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION wordmate.assign_hanzi_default_book() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE default_id uuid;
BEGIN
 INSERT INTO wordmate.hanzi_books(child_id,name,is_default) VALUES(NEW.child_id,'我的汉字本',true) ON CONFLICT DO NOTHING;
 SELECT id INTO default_id FROM wordmate.hanzi_books WHERE child_id=NEW.child_id AND is_default AND archived_at IS NULL;
 INSERT INTO wordmate.hanzi_book_items(book_id,child_id,hanzi_id) VALUES(default_id,NEW.child_id,NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hanzi_assign_default_book ON wordmate.hanzi;
CREATE TRIGGER hanzi_assign_default_book AFTER INSERT ON wordmate.hanzi FOR EACH ROW EXECUTE FUNCTION wordmate.assign_hanzi_default_book();
CREATE TABLE IF NOT EXISTS wordmate.shared_hanzi_books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_book_id uuid NOT NULL UNIQUE REFERENCES wordmate.hanzi_books(id) ON DELETE CASCADE,
 source_child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 publisher_user_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 title text NOT NULL, author text NOT NULL, description text NOT NULL DEFAULT '', published boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wordmate.shared_hanzi_book_items (
 shared_book_id uuid NOT NULL REFERENCES wordmate.shared_hanzi_books(id) ON DELETE CASCADE,
 ordinal integer NOT NULL, character text NOT NULL, pinyin text NOT NULL, radical text NOT NULL,
 strokes integer, meaning text NOT NULL, words text NOT NULL, example text NOT NULL,
 PRIMARY KEY(shared_book_id,ordinal), UNIQUE(shared_book_id,character)
);
CREATE TABLE IF NOT EXISTS wordmate.shared_hanzi_book_joins (
 shared_book_id uuid NOT NULL REFERENCES wordmate.shared_hanzi_books(id) ON DELETE CASCADE,
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 local_book_id uuid NOT NULL REFERENCES wordmate.hanzi_books(id) ON DELETE CASCADE,
 PRIMARY KEY(shared_book_id,child_id)
);
ALTER TABLE wordmate.hanzi_books ADD COLUMN IF NOT EXISTS read_only boolean NOT NULL DEFAULT false;

ALTER TABLE wordmate.hanzi_monthly_quizzes ADD COLUMN IF NOT EXISTS hanzi_book_id uuid REFERENCES wordmate.hanzi_books(id) ON DELETE SET NULL;
ALTER TABLE wordmate.hanzi ADD COLUMN IF NOT EXISTS book_orphaned boolean NOT NULL DEFAULT false;
ALTER TABLE wordmate.hanzi_books ADD COLUMN IF NOT EXISTS grade text NOT NULL DEFAULT '';
ALTER TABLE wordmate.hanzi_books ADD COLUMN IF NOT EXISTS textbook text NOT NULL DEFAULT '';
ALTER TABLE wordmate.hanzi_books ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE wordmate.shared_hanzi_books ADD COLUMN IF NOT EXISTS grade text NOT NULL DEFAULT '';
ALTER TABLE wordmate.shared_hanzi_books ADD COLUMN IF NOT EXISTS textbook text NOT NULL DEFAULT '';
ALTER TABLE wordmate.shared_hanzi_books ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
