-- +goose Up
-- Find a Note's Moves by index (#119). Opening a Note lists them, adding a
-- Move counts them, and deleting a Note or an account cascades to them, all by
-- note_id. No index from 009_moves.sql serves that: (id, note_id) leads with
-- the id, and moves_one_root_idx holds only the roots.
CREATE INDEX moves_note_idx ON moves (note_id);

-- +goose Down
DROP INDEX moves_note_idx;
