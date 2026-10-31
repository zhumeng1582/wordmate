CREATE TABLE IF NOT EXISTS wordmate.checkin_share_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requested_by uuid NOT NULL REFERENCES wordmate.users(id) ON DELETE CASCADE,
 cache_scope text NOT NULL DEFAULT '',
 theme text NOT NULL CHECK(theme IN ('growth','curiosity','perseverance','courage','discovery','calm')),
 prompt_copy text NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN ('pending','processing','succeeded','failed')),
 storage_key text,
 mime_type text NOT NULL DEFAULT 'image/png' CHECK(mime_type IN ('image/png','image/jpeg')),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '8 hours',
 completed_at timestamptz,
 CHECK ((status='succeeded')=(storage_key IS NOT NULL))
);
ALTER TABLE wordmate.checkin_share_images ADD COLUMN IF NOT EXISTS prompt_copy text NOT NULL DEFAULT '';
ALTER TABLE wordmate.checkin_share_images ADD COLUMN IF NOT EXISTS cache_scope text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS checkin_share_images_user_window ON wordmate.checkin_share_images(requested_by,created_at DESC);
CREATE INDEX IF NOT EXISTS checkin_share_images_queue ON wordmate.checkin_share_images(created_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS checkin_share_images_expiry ON wordmate.checkin_share_images(expires_at) WHERE expires_at IS NOT NULL;
