-- +goose Up
-- Only a hash of each refresh token is stored; the token lives in the user's cookie.
-- rotated_at: the token was exchanged for a new one. Presenting it again within a
--   short leeway window is exchanged again; after that it means it leaked, so
--   every session of that user is revoked. Rotating does not set revoked_at.
-- revoked_at: the token no longer works (logout, password reset, theft response),
--   even inside the leeway window. Presenting such a token is not a theft signal
--   by itself.
CREATE TABLE refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- +goose Down
DROP TABLE IF EXISTS refresh_tokens;
