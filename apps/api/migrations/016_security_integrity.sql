-- Minimal 48-hour spending ledger, deliberately independent of deletable learning rows.
CREATE TABLE IF NOT EXISTS wordmate.provider_usage_events (
 kind text NOT NULL CHECK(kind IN ('audio','vocabulary')),
 job_id uuid NOT NULL,
 attempt integer NOT NULL CHECK(attempt>0),
 budget_key text NOT NULL CHECK(length(budget_key)=64),
 child_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,job_id,attempt)
);
CREATE INDEX IF NOT EXISTS provider_usage_actor_time ON wordmate.provider_usage_events(kind,budget_key,created_at);
CREATE INDEX IF NOT EXISTS provider_usage_child_time ON wordmate.provider_usage_events(kind,child_id,created_at);
DO $$ BEGIN
 IF to_regclass('wordmate.audio_usage_events') IS NOT NULL THEN
  INSERT INTO wordmate.provider_usage_events(kind,job_id,attempt,budget_key,child_id,created_at)
  SELECT 'audio',a.job_id,a.attempt,encode(sha256(convert_to(u.wx_app_id||':'||u.wx_open_id,'UTF8')),'hex'),a.child_id,a.created_at
  FROM wordmate.audio_usage_events a JOIN wordmate.users u ON u.id=a.actor_id
  WHERE a.created_at>now()-interval '48 hours' ON CONFLICT DO NOTHING;
 END IF;
END $$;
INSERT INTO wordmate.provider_usage_events(kind,job_id,attempt,budget_key,child_id,created_at)
SELECT 'vocabulary',j.id,n,encode(sha256(convert_to(u.wx_app_id||':'||u.wx_open_id,'UTF8')),'hex'),j.child_id,j.updated_at
FROM wordmate.generation_jobs j JOIN wordmate.users u ON u.id=j.requested_by
CROSS JOIN LATERAL generate_series(1,j.attempts) n
WHERE j.payload->>'flow'='vocabulary_v1' AND j.updated_at>now()-interval '48 hours' ON CONFLICT DO NOTHING;
-- Preserve historical used check-ins; remove only unspent rewards unsupported by actual study.
DELETE FROM wordmate.checkin_makeup_credits c WHERE c.used_for_date IS NULL AND
 (c.milestone_date<>c.streak_start+c.milestone_days-1 OR
  (SELECT count(*) FROM wordmate.daily_activity d WHERE d.child_id=c.child_id
   AND d.local_date BETWEEN c.streak_start AND c.milestone_date AND d.distinct_words>=d.goal_snapshot)<>c.milestone_days);
