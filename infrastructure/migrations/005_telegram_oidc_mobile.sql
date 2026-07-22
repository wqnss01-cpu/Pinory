CREATE TABLE IF NOT EXISTS telegram_oidc_states (
  state_hash char(64) PRIMARY KEY,
  code_verifier text NOT NULL,
  nonce text NOT NULL,
  referral text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_oidc_states_expiry_idx
  ON telegram_oidc_states(expires_at);

CREATE TABLE IF NOT EXISTS mobile_auth_grants (
  grant_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mobile_auth_grants_expiry_idx
  ON mobile_auth_grants(expires_at);
