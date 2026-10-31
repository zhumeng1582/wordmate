BEGIN;
SET search_path TO wordmate, public;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_version integer NOT NULL DEFAULT 1 CHECK(profile_version>0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_revision integer NOT NULL DEFAULT 0 CHECK(avatar_revision>=0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime text CHECK(avatar_mime IN ('image/jpeg','image/png'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_bytes bytea CHECK(octet_length(avatar_bytes)<=131072);
COMMENT ON COLUMN users.avatar_bytes IS '家长主动选择的头像，仅本人、有效家庭成员及待审批家庭管理员可读取；注销时清除';
COMMIT;
