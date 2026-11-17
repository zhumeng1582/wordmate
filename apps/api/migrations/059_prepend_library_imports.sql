-- Keep all existing keys and relative order. New batches precede them; rows
-- within a transaction retain insertion order. Never reverse an entire list.
CREATE OR REPLACE FUNCTION wordmate.new_library_order() RETURNS numeric
LANGUAGE sql VOLATILE AS $$
 SELECT -extract(epoch FROM transaction_timestamp())*1000000000
        +nextval('wordmate.library_order_sequence')::numeric/1000000000
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['child_words','poems','wordbook_words','hanzi_book_items','poem_book_items','sentence_library','sentence_book_items'] LOOP
  IF to_regclass('wordmate.'||t) IS NOT NULL THEN
   EXECUTE format('ALTER TABLE wordmate.%I ALTER COLUMN order_key SET DEFAULT wordmate.new_library_order()',t);
  END IF;
 END LOOP;
END $$;
