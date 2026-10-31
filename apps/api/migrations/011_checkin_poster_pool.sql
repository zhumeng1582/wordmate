CREATE TABLE IF NOT EXISTS wordmate.checkin_poster_background_pool (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 generation_date date NOT NULL,
 slot smallint NOT NULL CHECK(slot BETWEEN 0 AND 9),
 theme text NOT NULL CHECK(theme IN ('growth','curiosity','perseverance','courage','discovery','calm')),
 prompt_copy text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','processing','succeeded','failed')),
 storage_key text,
 mime_type text NOT NULL DEFAULT 'image/png' CHECK(mime_type IN ('image/png','image/jpeg')),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '35 days',
 UNIQUE(generation_date,slot),
 CHECK ((status='succeeded')=(storage_key IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS checkin_poster_pool_queue ON wordmate.checkin_poster_background_pool(generation_date,slot) WHERE status='pending';
CREATE INDEX IF NOT EXISTS checkin_poster_pool_ready ON wordmate.checkin_poster_background_pool(generation_date,theme) WHERE status='succeeded';
CREATE INDEX IF NOT EXISTS checkin_poster_pool_expiry ON wordmate.checkin_poster_background_pool(expires_at);
