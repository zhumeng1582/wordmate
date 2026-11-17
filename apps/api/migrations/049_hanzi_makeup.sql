CREATE TABLE IF NOT EXISTS wordmate.hanzi_makeup_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 streak_start date NOT NULL,
 milestone_days integer NOT NULL CHECK(milestone_days>=15 AND milestone_days%15=0),
 milestone_date date NOT NULL,
 earned_at timestamptz NOT NULL DEFAULT now(),
 used_for_date date,
 used_at timestamptz,
 used_by uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 UNIQUE(child_id,streak_start,milestone_days),
 CHECK((used_for_date IS NULL AND used_at IS NULL) OR (used_for_date IS NOT NULL AND used_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS hanzi_makeup_once ON wordmate.hanzi_makeup_credits(child_id,used_for_date) WHERE used_for_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS hanzi_makeup_available ON wordmate.hanzi_makeup_credits(child_id,earned_at,id) WHERE used_for_date IS NULL;

-- Preserve credits already earned before this migration was introduced.
WITH checked AS (
 SELECT a.child_id,a.local_date,
        a.local_date-row_number() OVER(PARTITION BY a.child_id ORDER BY a.local_date)::integer AS streak_group
 FROM wordmate.hanzi_daily_activity a
 JOIN wordmate.hanzi_learning_events e ON e.child_id=a.child_id AND e.local_date=a.local_date
 GROUP BY a.child_id,a.local_date,a.goal_snapshot
 HAVING count(DISTINCT e.hanzi_id)>=a.goal_snapshot
), runs AS (
 SELECT child_id,min(local_date) AS streak_start,count(*)::integer AS day_count
 FROM checked GROUP BY child_id,streak_group
), milestones AS (
 SELECT child_id,streak_start,n::integer AS milestone_days,streak_start+(n::integer-1) AS milestone_date
 FROM runs CROSS JOIN LATERAL generate_series(15,(day_count/15)*15,15) n
)
INSERT INTO wordmate.hanzi_makeup_credits(child_id,streak_start,milestone_days,milestone_date)
SELECT child_id,streak_start,milestone_days,milestone_date FROM milestones
ON CONFLICT(child_id,streak_start,milestone_days) DO NOTHING;
