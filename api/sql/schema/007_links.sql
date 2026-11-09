-- +goose Up
-- The Link index (#9, ADR 0002). The text of a Comment or Body is the source
-- of truth; this table is rebuilt from its [[note:ID|label]] tokens on every
-- save, and serves Backlinks and the targets' names. A row goes with its Ply,
-- so clearing a Ply or deleting the linking Note removes its Links. The target
-- has no foreign key: deleting it leaves the Link in place, unresolved.
CREATE TABLE links (
  note_id BIGINT NOT NULL,
  ply INT NOT NULL,
  part TEXT NOT NULL CHECK (part IN ('comment', 'body')),
  target_id BIGINT NOT NULL,
  PRIMARY KEY (note_id, ply, part, target_id),
  FOREIGN KEY (note_id, ply) REFERENCES plies(note_id, ply) ON DELETE CASCADE
);

CREATE INDEX links_target_idx ON links (target_id);

-- +goose Down
DROP TABLE IF EXISTS links;
