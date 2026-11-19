CREATE TABLE IF NOT EXISTS wordmate.content_repairs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES wordmate.users(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('words','sentences','poems','hanzi')),
 target_id uuid NOT NULL,issue text NOT NULL,description text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','undone')),
 source jsonb NOT NULL,source_version integer NOT NULL,source_hash text NOT NULL,
 result jsonb,after_hash text,applied_source_version integer,undo_source_version integer,
 note text NOT NULL DEFAULT '',error_code text,lease_until timestamptz,attempt_id uuid,
 audio_kind text,audio_target uuid,audio_part text,accent text,voice_id text,
 speech_rate numeric NOT NULL DEFAULT 1,audio_context_hash text,audio_bytes bytea,audio_billing_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS content_repairs_active ON wordmate.content_repairs(child_id,kind,target_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS content_repairs_target ON wordmate.content_repairs(child_id,kind,target_id,created_at DESC);
CREATE INDEX IF NOT EXISTS content_repairs_audio ON wordmate.content_repairs(child_id,audio_kind,audio_target,audio_part,accent,voice_id) WHERE status='succeeded' AND audio_bytes IS NOT NULL;
-- Repair snapshots and speech are removed with their source content.
CREATE OR REPLACE FUNCTION wordmate.delete_content_repairs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM wordmate.content_repairs WHERE child_id=OLD.child_id AND
 ((kind=TG_ARGV[0] AND target_id=OLD.id) OR (audio_kind=TG_ARGV[0] AND audio_target=OLD.id)
 OR (TG_ARGV[0]='sentences' AND source->>'example_id'=OLD.id::text));
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS delete_content_repairs ON wordmate.child_words;
CREATE TRIGGER delete_content_repairs AFTER DELETE ON wordmate.child_words FOR EACH ROW EXECUTE FUNCTION wordmate.delete_content_repairs('words');
DROP TRIGGER IF EXISTS delete_content_repairs ON wordmate.sentences;
CREATE TRIGGER delete_content_repairs AFTER DELETE ON wordmate.sentences FOR EACH ROW EXECUTE FUNCTION wordmate.delete_content_repairs('sentences');
DROP TRIGGER IF EXISTS delete_content_repairs ON wordmate.poems;
CREATE TRIGGER delete_content_repairs AFTER DELETE ON wordmate.poems FOR EACH ROW EXECUTE FUNCTION wordmate.delete_content_repairs('poems');
DROP TRIGGER IF EXISTS delete_content_repairs ON wordmate.hanzi;
CREATE TRIGGER delete_content_repairs AFTER DELETE ON wordmate.hanzi FOR EACH ROW EXECUTE FUNCTION wordmate.delete_content_repairs('hanzi');
