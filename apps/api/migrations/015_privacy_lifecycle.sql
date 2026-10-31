CREATE TABLE IF NOT EXISTS wordmate.privacy_consent_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES wordmate.users(id),
 policy_version text NOT NULL,
 policy_hash text NOT NULL,
 action text NOT NULL CHECK(action IN ('accepted','withdrawn')),
 guardian_confirmed boolean NOT NULL,
 policy_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_consent_latest ON wordmate.privacy_consent_events(user_id,id DESC);
ALTER TABLE wordmate.lifecycle_jobs ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE wordmate.lifecycle_jobs ADD COLUMN IF NOT EXISTS request_hash text;
CREATE TABLE IF NOT EXISTS wordmate.lifecycle_objects (
 job_id uuid NOT NULL REFERENCES wordmate.lifecycle_jobs(id),
 kind text NOT NULL CHECK(kind IN ('audio','spool')),
 profile text NOT NULL DEFAULT '',
 object_key text NOT NULL,
 deleted_at timestamptz,
 PRIMARY KEY(job_id,kind,profile,object_key)
);
CREATE TABLE IF NOT EXISTS wordmate.deletion_tombstones (
 kind text NOT NULL CHECK(kind IN ('delete_child','delete_family','delete_account')),
 target_id uuid NOT NULL,
 family_id uuid,
 requested_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(kind,target_id)
);
-- Data rights must remain available without consenting again to learning services.
ALTER TABLE wordmate.auth_sessions ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'full' CHECK(scope IN ('full','data_management'));
