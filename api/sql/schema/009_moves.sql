-- +goose Up
-- A Note holds a tree of Moves (ADR 0009, #71). Each Move is a row under its
-- parent, ordered among its siblings: the first child continues the line, so
-- the Main line follows first children from the Position, and any later child
-- starts a Variation. The Position is the Note's root row, with no parent and
-- no SAN. The writing (Comment, Body, Glyphs and Drawings) is on the row it
-- belongs to, so reordering siblings never moves it. The server does not know
-- chess: it trusts the SAN, and keeps one child per SAN under a parent.
--
-- The stored PGN goes: its tag pairs are kept for export and search, and the
-- moves are read from the tree. Nothing was in production, so the old per-Ply
-- writing and the moves in each PGN are dropped, not moved; every Note gets an
-- empty root.

DROP TABLE links;
DROP TABLE plies;

DROP INDEX notes_players_trgm_idx;
ALTER TABLE notes
  DROP COLUMN game_date,
  DROP COLUMN black,
  DROP COLUMN white,
  DROP COLUMN pgn,
  -- The PGN tag pairs, in order: [["Event", "Casual"], ["White", "…"], …].
  ADD COLUMN tags JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(tags) = 'array');

-- White, Black and Date for search (005_note_search.sql), now read from the
-- tags. The first pair with the name wins; a missing, empty or "?" value is NULL.
ALTER TABLE notes
  ADD COLUMN white TEXT GENERATED ALWAYS AS (
    NULLIF(NULLIF(jsonb_path_query_first(tags, 'strict $[*] ? (@[0] == "White")[1]') #>> '{}', ''), '?')
  ) STORED,
  ADD COLUMN black TEXT GENERATED ALWAYS AS (
    NULLIF(NULLIF(jsonb_path_query_first(tags, 'strict $[*] ? (@[0] == "Black")[1]') #>> '{}', ''), '?')
  ) STORED,
  ADD COLUMN game_date TEXT GENERATED ALWAYS AS (
    NULLIF(NULLIF(jsonb_path_query_first(tags, 'strict $[*] ? (@[0] == "Date")[1]') #>> '{}', ''), '?')
  ) STORED;

-- The players expression must match the one in queries/notes.sql for the index to be used.
CREATE INDEX notes_players_trgm_idx ON notes USING gin ((coalesce(white, '') || ' ' || coalesce(black, '')) gin_trgm_ops);

-- The text caps are the API's; the database keeps the tree and the Glyphs honest.
-- Drawings are [{"from": "e2", "to": "e4", "brush": "green"}], a circle having no "to".
CREATE TABLE moves (
  id BIGSERIAL PRIMARY KEY,
  note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  parent_id BIGINT NULL,
  ord INT NOT NULL DEFAULT 0,
  san TEXT NULL,
  comment TEXT NULL,
  body TEXT NULL,
  move_glyph TEXT NULL CHECK (move_glyph IN ('!!', '!', '!?', '?!', '?', '??')),
  position_glyph TEXT NULL CHECK (position_glyph IN ('+−', '±', '⩲', '=', '∞', '⩱', '∓', '−+')),
  drawings JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(drawings) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, note_id),
  -- A parent is in the same Note; deleting a Move deletes its subtree.
  FOREIGN KEY (parent_id, note_id) REFERENCES moves(id, note_id) ON DELETE CASCADE,
  -- The root alone has no parent, and it alone has no SAN.
  CHECK ((parent_id IS NULL) = (san IS NULL)),
  -- The Position takes no Glyph about a move.
  CHECK (parent_id IS NOT NULL OR move_glyph IS NULL),
  -- One child per SAN under a parent, so replaying a Move reuses it.
  UNIQUE (parent_id, san)
);

CREATE UNIQUE INDEX moves_one_root_idx ON moves (note_id) WHERE parent_id IS NULL;
CREATE INDEX moves_parent_idx ON moves (parent_id, ord, id);

INSERT INTO moves (note_id) SELECT id FROM notes;

-- The Link index (ADR 0002), now keyed by the Move whose Comment or Body holds
-- the Link. A row goes with its Move, so deleting a subtree or the linking
-- Note removes its Links. The target has no foreign key: deleting it leaves
-- the Link in place, unresolved.
CREATE TABLE links (
  move_id BIGINT NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  part TEXT NOT NULL CHECK (part IN ('comment', 'body')),
  target_id BIGINT NOT NULL,
  PRIMARY KEY (move_id, part, target_id)
);

CREATE INDEX links_target_idx ON links (target_id);

-- +goose Down
DROP TABLE links;
DROP TABLE moves;

DROP INDEX notes_players_trgm_idx;
ALTER TABLE notes
  DROP COLUMN game_date,
  DROP COLUMN black,
  DROP COLUMN white,
  DROP COLUMN tags,
  ADD COLUMN pgn TEXT NOT NULL DEFAULT '*';
ALTER TABLE notes ALTER COLUMN pgn DROP DEFAULT;

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
CREATE INDEX notes_players_trgm_idx ON notes USING gin ((coalesce(white, '') || ' ' || coalesce(black, '')) gin_trgm_ops);

CREATE TABLE plies (
  note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  ply INT NOT NULL CHECK (ply >= 0),
  comment TEXT NULL,
  body TEXT NULL,
  move_glyph TEXT NULL CHECK (move_glyph IN ('!!', '!', '!?', '?!', '?', '??')),
  position_glyph TEXT NULL CHECK (position_glyph IN ('+−', '±', '⩲', '=', '∞', '⩱', '∓', '−+')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, ply),
  CHECK (ply > 0 OR move_glyph IS NULL)
);

CREATE TABLE links (
  note_id BIGINT NOT NULL,
  ply INT NOT NULL,
  part TEXT NOT NULL CHECK (part IN ('comment', 'body')),
  target_id BIGINT NOT NULL,
  PRIMARY KEY (note_id, ply, part, target_id),
  FOREIGN KEY (note_id, ply) REFERENCES plies(note_id, ply) ON DELETE CASCADE
);

CREATE INDEX links_target_idx ON links (target_id);
