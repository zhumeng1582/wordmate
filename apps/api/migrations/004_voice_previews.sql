-- Only a fixed, server-owned public sample; never personal vocabulary or arbitrary input.
CREATE TABLE IF NOT EXISTS wordmate.voice_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cache_key text NOT NULL UNIQUE,
 profile jsonb NOT NULL,
 accent text NOT NULL CHECK(accent IN ('en-GB','en-US')),
 voice_id text NOT NULL,
 storage_profile text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_until timestamptz,
 pending_audio bytea CHECK(octet_length(pending_audio)<=10485760),
 sha256 text,
 storage_key text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
