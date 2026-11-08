-- +goose Up
-- Search Notes by name and by the players in the game (#7). The players and
-- date are read from the PGN headers by generated columns, so they are
-- refreshed whenever the PGN changes, whoever writes it. A tag must start its
-- own line; a missing, empty or "?" value is NULL.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE notes
  ADD COLUMN white TEXT GENERATED ALWAYS AS (
    NULLIF(NULLIF(regexp_replace(substring(pgn FROM '(?n)^[ \t]*\[White[ \t]+"((?:[^"\\]|\\.)*)"'), '\\(.)', '\1', 'g'), ''), '?')
  ) STORED,
  ADD COLUMN black TEXT GENERATED ALWAYS AS (
    NULLIF(NULLIF(regexp_replace(substring(pgn FROM '(?n)^[ \t]*\[Black[ \t]+"((?:[^"\\]|\\.)*)"'), '\\(.)', '\1', 'g'), ''), '?')
  ) STORED,
  ADD COLUMN game_date TEXT GENERATED ALWAYS AS (
    NULLIF(NULLIF(regexp_replace(substring(pgn FROM '(?n)^[ \t]*\[Date[ \t]+"((?:[^"\\]|\\.)*)"'), '\\(.)', '\1', 'g'), ''), '?')
  ) STORED;

-- The players expression must match the one in queries/notes.sql for the index to be used.
CREATE INDEX notes_name_trgm_idx ON notes USING gin (name gin_trgm_ops);
CREATE INDEX notes_players_trgm_idx ON notes USING gin ((coalesce(white, '') || ' ' || coalesce(black, '')) gin_trgm_ops);

-- +goose Down
DROP INDEX IF EXISTS notes_players_trgm_idx;
DROP INDEX IF EXISTS notes_name_trgm_idx;
ALTER TABLE notes DROP COLUMN IF EXISTS game_date, DROP COLUMN IF EXISTS black, DROP COLUMN IF EXISTS white;
