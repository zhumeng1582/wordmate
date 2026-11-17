-- Preserve existing library order; newly imported items append in source order.
-- A numeric key reserves nanosecond slots within an import's creation time.
CREATE SEQUENCE IF NOT EXISTS wordmate.library_order_sequence;
DO $$
DECLARE t text; rec record;
BEGIN
 FOR t IN SELECT unnest(ARRAY['child_words','poems']) LOOP
  IF to_regclass('wordmate.'||t) IS NOT NULL THEN
   EXECUTE format('ALTER TABLE wordmate.%I ADD COLUMN IF NOT EXISTS order_key numeric',t);
   EXECUTE format('WITH ranked AS (SELECT id,-row_number() OVER(ORDER BY created_at,id)::numeric k FROM wordmate.%I) UPDATE wordmate.%I a SET order_key=r.k FROM ranked r WHERE a.id=r.id AND a.order_key IS NULL',t,t);
   EXECUTE format('ALTER TABLE wordmate.%I ALTER COLUMN order_key SET DEFAULT (extract(epoch FROM clock_timestamp())*1000000000 + nextval(''wordmate.library_order_sequence'')::numeric/1000000000), ALTER COLUMN order_key SET NOT NULL',t);
  END IF;
 END LOOP;
 FOR rec IN SELECT * FROM (VALUES ('wordbook_words','child_word_id','child_words'),('hanzi_book_items','hanzi_id','hanzi'),('poem_book_items','poem_id','poems')) AS x(tbl,item,contents) LOOP
  IF to_regclass('wordmate.'||rec.tbl) IS NOT NULL THEN
   EXECUTE format('ALTER TABLE wordmate.%I ADD COLUMN IF NOT EXISTS order_key numeric',rec.tbl);
   IF rec.contents='hanzi' THEN
    EXECUTE 'WITH ranked AS (SELECT id,row_number() OVER(ORDER BY sort_order ASC NULLS LAST,created_at DESC,id DESC)::numeric k FROM wordmate.hanzi) UPDATE wordmate.hanzi_book_items a SET order_key=r.k-1000000000000000 FROM ranked r WHERE a.hanzi_id=r.id AND a.order_key IS NULL';
   ELSE
    EXECUTE format('UPDATE wordmate.%I a SET order_key=c.order_key FROM wordmate.%I c WHERE a.%I=c.id AND a.order_key IS NULL',rec.tbl,rec.contents,rec.item);
   END IF;
   EXECUTE format('ALTER TABLE wordmate.%I ALTER COLUMN order_key SET DEFAULT (extract(epoch FROM clock_timestamp())*1000000000 + nextval(''wordmate.library_order_sequence'')::numeric/1000000000), ALTER COLUMN order_key SET NOT NULL',rec.tbl);
  END IF;
 END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS word_import_order ON wordmate.child_words(child_id,order_key,id);
CREATE INDEX IF NOT EXISTS sentence_target_word_lookup ON wordmate.sentence_targets(child_word_id,sentence_id);
