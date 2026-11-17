ALTER TABLE wordmate.hanzi_monthly_quizzes ADD COLUMN IF NOT EXISTS lease_id uuid;
ALTER TABLE wordmate.hanzi_monthly_quizzes ADD COLUMN IF NOT EXISTS lease_owner uuid REFERENCES wordmate.users(id) ON DELETE SET NULL;
ALTER TABLE wordmate.hanzi_monthly_quizzes ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE wordmate.hanzi_monthly_quizzes ADD COLUMN IF NOT EXISTS lease_generation integer NOT NULL DEFAULT 0;
