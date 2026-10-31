SET search_path TO wordmate, public;
ALTER TABLE ai_calls DROP CONSTRAINT IF EXISTS ai_calls_kind_check;
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_kind_check CHECK(kind IN ('vocabulary','vision','connection_test','audio'));
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS billable_characters integer CHECK(billable_characters>=0);
-- Retry requires a fresh user tap; old successful audio is never billed retroactively.
UPDATE generation_jobs SET attempts=0,error_code=NULL,updated_at=now()
 WHERE kind='audio' AND status='failed' AND error_code='AUDIO_DAILY_LIMIT';
UPDATE audio_assets SET error_code=NULL WHERE error_code='AUDIO_DAILY_LIMIT';
