ALTER TABLE wordmate.poems ADD COLUMN IF NOT EXISTS genre text NOT NULL DEFAULT '' CHECK(length(genre)<=80);
ALTER TABLE wordmate.poems ADD COLUMN IF NOT EXISTS annotations text NOT NULL DEFAULT '' CHECK(length(annotations)<=3000);
ALTER TABLE wordmate.poems ADD COLUMN IF NOT EXISTS translation text NOT NULL DEFAULT '' CHECK(length(translation)<=3000);
ALTER TABLE wordmate.poems ADD COLUMN IF NOT EXISTS background text NOT NULL DEFAULT '' CHECK(length(background)<=3000);
ALTER TABLE wordmate.poems ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '' CHECK(length(source)<=200);
ALTER TABLE wordmate.poems ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '' CHECK(length(notes)<=3000);
ALTER TABLE wordmate.poems ADD COLUMN IF NOT EXISTS pinyin text NOT NULL DEFAULT '' CHECK(length(pinyin)<=3000);
