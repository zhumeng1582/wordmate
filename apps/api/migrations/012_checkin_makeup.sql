CREATE TABLE IF NOT EXISTS wordmate.checkin_makeup_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id),
 streak_start date NOT NULL,
 milestone_days integer NOT NULL CHECK(milestone_days>=15 AND milestone_days%15=0),
 milestone_date date NOT NULL,
 earned_at timestamptz NOT NULL DEFAULT now(),
 used_for_date date,
 used_at timestamptz,
 used_by uuid REFERENCES wordmate.users(id),
 UNIQUE(child_id,streak_start,milestone_days),
 CHECK((used_for_date IS NULL AND used_at IS NULL AND used_by IS NULL) OR
       (used_for_date IS NOT NULL AND used_at IS NOT NULL AND used_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS checkin_makeup_once_per_day
 ON wordmate.checkin_makeup_credits(child_id,used_for_date) WHERE used_for_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS checkin_makeup_available
 ON wordmate.checkin_makeup_credits(child_id,earned_at,id) WHERE used_for_date IS NULL;

-- Give existing children credit for 15-day streak milestones already reached.
WITH checked AS (
 SELECT child_id,local_date,
        local_date-row_number() OVER(PARTITION BY child_id ORDER BY local_date)::integer AS streak_group
 FROM wordmate.daily_activity
 WHERE distinct_words>=goal_snapshot
),runs AS (
 SELECT child_id,min(local_date) AS streak_start,max(local_date) AS streak_end,count(*)::integer AS day_count
 FROM checked GROUP BY child_id,streak_group
),milestones AS (
 SELECT child_id,streak_start,n::integer AS milestone_days,streak_start+(n::integer-1) AS milestone_date
 FROM runs CROSS JOIN LATERAL generate_series(15,(day_count/15)*15,15) n
)
INSERT INTO wordmate.checkin_makeup_credits(child_id,streak_start,milestone_days,milestone_date)
SELECT child_id,streak_start,milestone_days,milestone_date FROM milestones
ON CONFLICT(child_id,streak_start,milestone_days) DO NOTHING;
