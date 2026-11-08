-- +goose Up
-- A Note owns its PGN and starting Position (ADR 0003). start_fen is NULL for
-- the standard start. The server does not parse the PGN; the client does.
CREATE TABLE notes (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  pgn TEXT NOT NULL,
  start_fen TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notes_user_updated_idx ON notes (user_id, updated_at DESC);

-- +goose Down
DROP TABLE IF EXISTS notes;
