-- +goose Up
UPDATE users SET created_at = now() WHERE created_at IS NULL;
UPDATE users SET email = lower(btrim(email));

ALTER TABLE users
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN email_verified_at TIMESTAMPTZ NULL,
  ADD CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)));

-- Display names are unique ignoring case, so "Ada" and "ada" cannot both exist
ALTER TABLE users DROP CONSTRAINT users_name_key;
CREATE UNIQUE INDEX users_name_lower_key ON users (lower(name));

CREATE TYPE email_token_purpose AS ENUM ('verify', 'reset');

-- Only a hash of each token is stored; the token itself exists only in the email
CREATE TABLE email_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose email_token_purpose NOT NULL,
  token_hash BYTEA NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_tokens_user_purpose_idx ON email_tokens (user_id, purpose);

-- +goose Down
DROP TABLE IF EXISTS email_tokens;
DROP TYPE IF EXISTS email_token_purpose;

DROP INDEX IF EXISTS users_name_lower_key;
ALTER TABLE users ADD CONSTRAINT users_name_key UNIQUE (name);

ALTER TABLE users
  DROP CONSTRAINT users_email_normalized,
  DROP COLUMN email_verified_at,
  DROP COLUMN updated_at,
  ALTER COLUMN created_at DROP NOT NULL,
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC';
