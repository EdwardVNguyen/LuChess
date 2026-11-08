-- +goose Up
-- The user's writing on one Ply of a Note's mainline (#8, ADR 0003): a
-- Comment, a Body and up to one Glyph of each kind. Ply 0 is the Position, so
-- it takes no Glyph about a move. A row exists only while it holds something.
-- The text caps are the API's; the database only keeps the Glyphs honest.
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

-- +goose Down
DROP TABLE IF EXISTS plies;
