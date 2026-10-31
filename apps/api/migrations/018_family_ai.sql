SET search_path TO wordmate,public;
-- Stop workers before upgrading. Never move an in-flight personal reservation.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM ai_wallets WHERE frozen_micros<>0) THEN
  RAISE EXCEPTION 'Settle or expire personal AI reservations before migration 018';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS ai_capability_settings (
 user_id uuid NOT NULL REFERENCES users(id),
 capability text NOT NULL CHECK(capability IN ('text','vision')),
 mode text NOT NULL DEFAULT 'system' CHECK(mode IN ('system','byok')),
 model_id text,custom_model jsonb,credential text,
 version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,capability)
);
INSERT INTO ai_capability_settings(user_id,capability,mode,model_id,custom_model,credential,version,updated_at)
 SELECT user_id,'text',mode,model_id,custom_model,credential,version,updated_at FROM ai_account_settings ON CONFLICT DO NOTHING;
UPDATE ai_account_settings SET credential=NULL WHERE credential IS NOT NULL;
CREATE TABLE IF NOT EXISTS ai_family_wallets (
 family_id uuid PRIMARY KEY,
 balance_micros bigint NOT NULL,
 frozen_micros bigint NOT NULL DEFAULT 0 CHECK(frozen_micros>=0),
 gift_remaining_micros bigint NOT NULL DEFAULT 20000000 CHECK(gift_remaining_micros BETWEEN 0 AND 20000000),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Financial receipts survive family deletion; API access always checks active membership.
CREATE TABLE IF NOT EXISTS ai_family_wallet_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),family_id uuid NOT NULL,
 user_id uuid REFERENCES users(id),kind text NOT NULL CHECK(kind IN ('gift','credit','charge','refund','transfer')),
 reference text NOT NULL,amount_micros bigint NOT NULL,
 gift_used_micros bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,reference)
);
CREATE INDEX IF NOT EXISTS ai_family_entries_time ON ai_family_wallet_entries(family_id,created_at DESC);
CREATE OR REPLACE FUNCTION initialize_family_ai_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO wordmate.ai_family_wallets(family_id,balance_micros) VALUES(NEW.id,20000000) ON CONFLICT DO NOTHING;
 INSERT INTO wordmate.ai_family_wallet_entries(family_id,user_id,kind,reference,amount_micros)
 VALUES(NEW.id,NEW.owner_user_id,'gift','family-welcome:'||NEW.id,20000000) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS family_ai_welcome ON families;
CREATE TRIGGER family_ai_welcome AFTER INSERT ON families FOR EACH ROW EXECUTE FUNCTION initialize_family_ai_wallet();
INSERT INTO ai_family_wallets(family_id,balance_micros) SELECT id,20000000 FROM families WHERE status='active' ON CONFLICT DO NOTHING;
INSERT INTO ai_family_wallet_entries(family_id,user_id,kind,reference,amount_micros)
 SELECT id,owner_user_id,'gift','family-welcome:'||id,20000000 FROM families WHERE status='active' ON CONFLICT DO NOTHING;
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS family_id uuid;
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS capability text NOT NULL DEFAULT 'text';
UPDATE ai_calls SET capability='vision' WHERE kind='vision';
ALTER TABLE ai_recharge_orders ADD COLUMN IF NOT EXISTS family_id uuid;
CREATE INDEX IF NOT EXISTS ai_calls_family_time ON ai_calls(family_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_orders_family_time ON ai_recharge_orders(family_id,created_at DESC);
-- Only unambiguous legacy funds/orders are assigned automatically. Other balances remain intact.
DO $$ DECLARE r record;fid uuid;entry uuid; BEGIN
 FOR r IN SELECT w.* FROM ai_wallets w WHERE w.balance_micros<>0 LOOP
  SELECT (array_agg(m.family_id ORDER BY m.family_id))[1] INTO fid
   FROM family_members m JOIN families f ON f.id=m.family_id AND f.status='active'
   WHERE m.user_id=r.user_id AND m.status='active' HAVING count(*)=1;
  IF fid IS NOT NULL THEN
   INSERT INTO ai_family_wallet_entries(family_id,user_id,kind,reference,amount_micros)
    VALUES(fid,r.user_id,'transfer','legacy-wallet:'||r.user_id,r.balance_micros)
    ON CONFLICT DO NOTHING RETURNING id INTO entry;
   IF entry IS NOT NULL THEN
    UPDATE ai_family_wallets SET balance_micros=balance_micros+r.balance_micros WHERE family_id=fid;
    UPDATE ai_wallets SET balance_micros=0 WHERE user_id=r.user_id;
   END IF;
  END IF;
 END LOOP;
END $$;
UPDATE ai_recharge_orders o SET family_id=x.family_id FROM (
 SELECT m.user_id,(array_agg(m.family_id ORDER BY m.family_id))[1] family_id
 FROM family_members m JOIN families f ON f.id=m.family_id AND f.status='active'
 WHERE m.status='active' GROUP BY m.user_id HAVING count(*)=1
) x WHERE o.user_id=x.user_id AND o.family_id IS NULL;
