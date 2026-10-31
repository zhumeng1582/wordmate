SET search_path TO wordmate, public;
CREATE TABLE IF NOT EXISTS ai_account_settings (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 mode text NOT NULL DEFAULT 'system' CHECK(mode IN ('system','byok')),
 model_id text,
 custom_model jsonb,
 credential text,
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_wallets (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 balance_micros bigint NOT NULL DEFAULT 0,
 frozen_micros bigint NOT NULL DEFAULT 0 CHECK(frozen_micros>=0)
);
CREATE TABLE IF NOT EXISTS ai_calls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL UNIQUE,
 user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('vocabulary','vision','connection_test')),
 mode text NOT NULL CHECK(mode IN ('system','byok')),
 provider text NOT NULL, model text NOT NULL,
 settings_version integer NOT NULL,
 state text NOT NULL CHECK(state IN ('running','ready','succeeded','failed','uncertain')),
 reserved_micros bigint NOT NULL DEFAULT 0,
 cost_micros bigint,
 charge_micros bigint NOT NULL DEFAULT 0,
 input_tokens integer, output_tokens integer, cached_tokens integer,
 error_code text,
 tariff jsonb NOT NULL,
 upstream_request_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_calls_user_time ON ai_calls(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ai_wallet_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('credit','charge','refund')),
 reference text NOT NULL,
 amount_micros bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,reference)
);
CREATE INDEX IF NOT EXISTS ai_wallet_entries_user_time ON ai_wallet_entries(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ai_recharge_orders (
 id text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 client_key text NOT NULL,
 payer_identity text NOT NULL,
 product_id text NOT NULL,
 amount_fen integer NOT NULL CHECK(amount_fen>0),
 credit_micros bigint NOT NULL CHECK(credit_micros>0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','refunded','closed')),
 platform_order_id text UNIQUE,
 refunded_fen integer NOT NULL DEFAULT 0,
 last_checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,client_key)
);

CREATE INDEX IF NOT EXISTS ai_recharge_orders_user_time ON ai_recharge_orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_recharge_orders_reconcile ON ai_recharge_orders(last_checked_at) WHERE state IN ('pending','paid');
