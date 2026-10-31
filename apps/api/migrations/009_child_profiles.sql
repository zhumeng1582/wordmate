ALTER TABLE wordmate.children
 ADD COLUMN IF NOT EXISTS school_grade text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'unspecified' CHECK(gender IN ('unspecified','girl','boy'));
