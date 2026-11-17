ALTER TABLE wordmate.hanzi_import_jobs ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES wordmate.hanzi_books(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS wordmate.import_records (
 kind text NOT NULL CHECK(kind IN ('words','poems','hanzi')),source_id uuid NOT NULL,child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES wordmate.users(id) ON DELETE CASCADE,source text NOT NULL DEFAULT 'task',status text NOT NULL,
 summary text NOT NULL DEFAULT '',saved_count integer NOT NULL DEFAULT 0,book_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,source_id)
);
CREATE INDEX IF NOT EXISTS import_records_child_time ON wordmate.import_records(child_id,created_at DESC,kind,source_id);
CREATE OR REPLACE FUNCTION wordmate.remember_import_task() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; k text; a uuid; destination uuid; total integer; summary_text text;
BEGIN
 r=to_jsonb(NEW);k=TG_ARGV[0];
 IF k='words' THEN
  IF coalesce(r->'payload'->>'flow','') NOT IN ('vocabulary_v1','vocabulary_bulk_v1') OR r->'payload'->>'bulk_parent_id' IS NOT NULL THEN RETURN NEW; END IF;
  a=(r->>'requested_by')::uuid;destination=(r->'payload'->>'wordbook_id')::uuid;
  summary_text='单词材料';SELECT count(*)::int INTO total FROM wordmate.batch_items i JOIN wordmate.generation_jobs g ON i.batch_id=(g.payload->>'batch_id')::uuid WHERE (g.id=NEW.id OR g.payload->>'bulk_parent_id'=NEW.id::text) AND i.child_word_id IS NOT NULL;
 ELSE
  a=(r->>'actor_id')::uuid;destination=(r->>'book_id')::uuid;summary_text=coalesce(nullif(r->>'source_name',''),CASE WHEN k='poems' THEN '诗词材料' ELSE '汉字材料' END);total=coalesce((r->>'saved_count')::integer,0);
 END IF;
 INSERT INTO wordmate.import_records(kind,source_id,child_id,actor_id,status,summary,saved_count,book_id,created_at,updated_at)
 VALUES(k,NEW.id,NEW.child_id,a,CASE WHEN r->>'error_code'='USER_CANCELLED' THEN 'cancelled' ELSE NEW.status END,left(summary_text,120),total,destination,NEW.created_at,NEW.updated_at)
 ON CONFLICT(kind,source_id) DO UPDATE SET status=excluded.status,saved_count=greatest(import_records.saved_count,excluded.saved_count),book_id=excluded.book_id,updated_at=excluded.updated_at;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS remember_word_import ON wordmate.generation_jobs;
CREATE TRIGGER remember_word_import AFTER INSERT OR UPDATE ON wordmate.generation_jobs FOR EACH ROW EXECUTE FUNCTION wordmate.remember_import_task('words');
DROP TRIGGER IF EXISTS remember_poem_import ON wordmate.poem_import_jobs;
CREATE TRIGGER remember_poem_import AFTER INSERT OR UPDATE ON wordmate.poem_import_jobs FOR EACH ROW EXECUTE FUNCTION wordmate.remember_import_task('poems');
DROP TRIGGER IF EXISTS remember_hanzi_import ON wordmate.hanzi_import_jobs;
CREATE TRIGGER remember_hanzi_import AFTER INSERT OR UPDATE ON wordmate.hanzi_import_jobs FOR EACH ROW EXECUTE FUNCTION wordmate.remember_import_task('hanzi');
INSERT INTO wordmate.import_records(kind,source_id,child_id,actor_id,status,summary,saved_count,book_id,created_at,updated_at)
 SELECT 'poems',id,child_id,actor_id,CASE WHEN error_code='USER_CANCELLED' THEN 'cancelled' ELSE status END,coalesce(source_name,'诗词材料'),coalesce(saved_count,0),book_id,created_at,updated_at FROM wordmate.poem_import_jobs ON CONFLICT DO NOTHING;
INSERT INTO wordmate.import_records(kind,source_id,child_id,actor_id,status,summary,created_at,updated_at)
 SELECT 'hanzi',id,child_id,actor_id,status,coalesce(source_name,'汉字材料'),created_at,updated_at FROM wordmate.hanzi_import_jobs ON CONFLICT DO NOTHING;
INSERT INTO wordmate.import_records(kind,source_id,child_id,actor_id,status,summary,book_id,created_at,updated_at)
 SELECT 'words',id,child_id,requested_by,status,'单词材料',(payload->>'wordbook_id')::uuid,created_at,updated_at FROM wordmate.generation_jobs WHERE payload->>'flow' IN ('vocabulary_v1','vocabulary_bulk_v1') AND payload->>'bulk_parent_id' IS NULL ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION wordmate.remember_word_item_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE record_id uuid;
BEGIN
 FOR record_id IN SELECT DISTINCT coalesce((g.payload->>'bulk_parent_id')::uuid,g.id) FROM wordmate.generation_jobs g WHERE g.payload->>'batch_id'=NEW.batch_id::text LOOP
  UPDATE wordmate.import_records r SET saved_count=(SELECT count(*)::int FROM wordmate.batch_items i JOIN wordmate.generation_jobs g ON i.batch_id=(g.payload->>'batch_id')::uuid WHERE (g.id=record_id OR g.payload->>'bulk_parent_id'=record_id::text) AND i.child_word_id IS NOT NULL),updated_at=now() WHERE r.kind='words' AND r.source_id=record_id;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS remember_word_item_count ON wordmate.batch_items;
CREATE TRIGGER remember_word_item_count AFTER INSERT OR UPDATE OF child_word_id,status ON wordmate.batch_items FOR EACH ROW EXECUTE FUNCTION wordmate.remember_word_item_count();
