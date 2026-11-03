SET search_path TO wordmate,public;
CREATE INDEX IF NOT EXISTS generation_jobs_bulk_parent_idx
 ON generation_jobs ((payload->>'bulk_parent_id'))
 WHERE payload->>'bulk_parent_id' IS NOT NULL;
