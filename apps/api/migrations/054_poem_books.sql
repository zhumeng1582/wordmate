CREATE TABLE IF NOT EXISTS wordmate.poem_books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 60),is_default boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 grade text NOT NULL DEFAULT '',textbook text NOT NULL DEFAULT '',category text NOT NULL DEFAULT '',read_only boolean NOT NULL DEFAULT false,UNIQUE(id,child_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS poem_one_default_book ON wordmate.poem_books(child_id) WHERE is_default AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS poem_identity_child ON wordmate.poems(id,child_id);
CREATE TABLE IF NOT EXISTS wordmate.poem_book_items (
 book_id uuid NOT NULL,child_id uuid NOT NULL,poem_id uuid NOT NULL,PRIMARY KEY(book_id,poem_id),
 FOREIGN KEY(book_id,child_id) REFERENCES wordmate.poem_books(id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(poem_id,child_id) REFERENCES wordmate.poems(id,child_id) ON DELETE CASCADE
);
WITH created AS (INSERT INTO wordmate.poem_books(child_id,name,is_default) SELECT id,'我的诗本',true FROM wordmate.children ON CONFLICT DO NOTHING RETURNING id,child_id)
INSERT INTO wordmate.poem_book_items(book_id,child_id,poem_id) SELECT b.id,p.child_id,p.id FROM wordmate.poems p JOIN created b ON b.child_id=p.child_id ON CONFLICT DO NOTHING;
ALTER TABLE wordmate.poems ADD COLUMN IF NOT EXISTS book_orphaned boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION wordmate.assign_poem_default_book() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE default_id uuid;
BEGIN
 INSERT INTO wordmate.poem_books(child_id,name,is_default) VALUES(NEW.child_id,'我的诗本',true) ON CONFLICT DO NOTHING;
 SELECT id INTO default_id FROM wordmate.poem_books WHERE child_id=NEW.child_id AND is_default AND archived_at IS NULL;
 INSERT INTO wordmate.poem_book_items(book_id,child_id,poem_id) VALUES(default_id,NEW.child_id,NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS poem_assign_default_book ON wordmate.poems;
CREATE TRIGGER poem_assign_default_book AFTER INSERT ON wordmate.poems FOR EACH ROW EXECUTE FUNCTION wordmate.assign_poem_default_book();
CREATE TABLE IF NOT EXISTS wordmate.shared_poem_books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_book_id uuid NOT NULL UNIQUE REFERENCES wordmate.poem_books(id) ON DELETE CASCADE,
 source_child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,publisher_user_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 title text NOT NULL,author text NOT NULL,description text NOT NULL DEFAULT '',grade text NOT NULL DEFAULT '',textbook text NOT NULL DEFAULT '',category text NOT NULL DEFAULT '',
 published boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wordmate.shared_poem_book_items (
 shared_book_id uuid NOT NULL REFERENCES wordmate.shared_poem_books(id) ON DELETE CASCADE,ordinal integer NOT NULL,content jsonb NOT NULL,PRIMARY KEY(shared_book_id,ordinal)
);
CREATE TABLE IF NOT EXISTS wordmate.shared_poem_book_joins (
 shared_book_id uuid NOT NULL REFERENCES wordmate.shared_poem_books(id) ON DELETE CASCADE,child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 local_book_id uuid NOT NULL REFERENCES wordmate.poem_books(id) ON DELETE CASCADE,PRIMARY KEY(shared_book_id,child_id)
);
ALTER TABLE wordmate.poem_import_jobs ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES wordmate.poem_books(id) ON DELETE SET NULL;
