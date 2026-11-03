ALTER TABLE wordmate.wordbooks ADD COLUMN IF NOT EXISTS grade varchar(40) NOT NULL DEFAULT '';
ALTER TABLE wordmate.wordbooks ADD COLUMN IF NOT EXISTS textbook varchar(40) NOT NULL DEFAULT '';
ALTER TABLE wordmate.wordbooks ADD COLUMN IF NOT EXISTS category varchar(40) NOT NULL DEFAULT '';
ALTER TABLE wordmate.shared_wordbooks ADD COLUMN IF NOT EXISTS grade varchar(40) NOT NULL DEFAULT '';
ALTER TABLE wordmate.shared_wordbooks ADD COLUMN IF NOT EXISTS textbook varchar(40) NOT NULL DEFAULT '';
ALTER TABLE wordmate.shared_wordbooks ADD COLUMN IF NOT EXISTS category varchar(40) NOT NULL DEFAULT '';
