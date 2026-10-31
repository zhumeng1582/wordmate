BEGIN;
SET search_path TO wordmate, public;

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;
UPDATE users
SET referral_code=lower(substr(replace(gen_random_uuid()::text,'-',''),1,16))
WHERE referral_code IS NULL;
ALTER TABLE users ALTER COLUMN referral_code SET NOT NULL;
ALTER TABLE users ALTER COLUMN referral_code SET DEFAULT lower(substr(replace(gen_random_uuid()::text,'-',''),1,16));
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_lower_uidx ON users(lower(referral_code));

CREATE TABLE IF NOT EXISTS user_referrals (
 invited_user_id uuid PRIMARY KEY REFERENCES users(id),
 inviter_user_id uuid NOT NULL REFERENCES users(id),
 referral_code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(invited_user_id <> inviter_user_id)
);
CREATE INDEX IF NOT EXISTS user_referrals_inviter_created_idx ON user_referrals(inviter_user_id,created_at DESC);
COMMENT ON TABLE user_referrals IS '首次注册归因关系；每个受邀账号最多记录一个邀请人';

COMMIT;
