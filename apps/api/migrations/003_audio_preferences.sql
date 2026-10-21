-- Account-level pronunciation preferences, independent of family and child.
ALTER TABLE wordmate.users ADD COLUMN IF NOT EXISTS audio_accent text NOT NULL DEFAULT 'en-GB' CHECK(audio_accent IN ('en-GB','en-US'));
ALTER TABLE wordmate.users ADD COLUMN IF NOT EXISTS audio_voice_id text;
ALTER TABLE wordmate.users ADD COLUMN IF NOT EXISTS audio_settings_version integer NOT NULL DEFAULT 1;
