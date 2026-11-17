-- Normalize display-only grammatical labels without changing word IDs, senses,
-- versions, examples, book order or learning history. Unknown labels stay intact.
CREATE OR REPLACE FUNCTION wordmate.short_word_pos(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result text := value; pair text[];
BEGIN
 FOREACH pair SLICE 1 IN ARRAY ARRAY[
 ['noun','n.'],['verb','v.'],['adjective','adj.'],['adverb','adv.'],
 ['pronoun','pron.'],['preposition','prep.'],['conjunction','conj.'],
 ['interjection','interj.'],['article','art.'],['determiner','det.'],
 ['numeral','num.'],['number','num.'],['phrase','phr.'],
 ['n','n.'],['v','v.'],['adj','adj.'],['adv','adv.'],['pron','pron.'],
 ['prep','prep.'],['conj','conj.'],['interj','interj.'],['art','art.'],
 ['det','det.'],['num','num.'],['phr','phr.'],
 ['名词','n.'],['动词','v.'],['形容词','adj.'],['副词','adv.'],
 ['代词','pron.'],['介词','prep.'],['连词','conj.'],['感叹词','interj.'],
 ['冠词','art.'],['数词','num.'],['短语','phr.']
 ] LOOP
  result := regexp_replace(result, '\m' || pair[1] || '\M\.?', pair[2], 'gi');
 END LOOP;
 RETURN result;
END $$;
-- A uniqueness collision must roll back, never silently merge words or progress.
UPDATE wordmate.child_words SET part_of_speech=wordmate.short_word_pos(part_of_speech)
WHERE part_of_speech IS DISTINCT FROM wordmate.short_word_pos(part_of_speech);
UPDATE wordmate.shared_wordbook_items SET part_of_speech=wordmate.short_word_pos(part_of_speech)
WHERE part_of_speech IS DISTINCT FROM wordmate.short_word_pos(part_of_speech);
CREATE OR REPLACE FUNCTION wordmate.normalize_word_pos() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.part_of_speech := wordmate.short_word_pos(NEW.part_of_speech); RETURN NEW; END $$;
CREATE TRIGGER normalize_word_pos BEFORE INSERT OR UPDATE OF part_of_speech ON wordmate.child_words
FOR EACH ROW EXECUTE FUNCTION wordmate.normalize_word_pos();
CREATE TRIGGER normalize_shared_word_pos BEFORE INSERT OR UPDATE OF part_of_speech ON wordmate.shared_wordbook_items
FOR EACH ROW EXECUTE FUNCTION wordmate.normalize_word_pos();
