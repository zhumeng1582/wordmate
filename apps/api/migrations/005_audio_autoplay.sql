-- Opt-in, account-level automatic review word pronunciation.
ALTER TABLE wordmate.users ADD COLUMN IF NOT EXISTS audio_auto_play boolean NOT NULL DEFAULT false;
