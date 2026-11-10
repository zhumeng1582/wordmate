-- Multiple existing senses are stored in the existing word columns.
ALTER TABLE wordmate.child_words ALTER COLUMN part_of_speech TYPE varchar(240), ALTER COLUMN meaning_zh TYPE varchar(4000);
ALTER TABLE wordmate.shared_wordbook_items ALTER COLUMN part_of_speech TYPE varchar(240), ALTER COLUMN meaning_zh TYPE varchar(4000);
ALTER TABLE wordmate.word_tutor_sessions ALTER COLUMN part_of_speech TYPE varchar(240), ALTER COLUMN meaning_zh TYPE varchar(4000);
