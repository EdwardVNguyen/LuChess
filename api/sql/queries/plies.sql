-- Writing on a Ply is reached through its Note, scoped to the owner, so
-- another user's Plies are simply not found. Writing also touches the Note.

-- name: ListPlies :many
SELECT p.*
FROM plies p
JOIN notes n ON n.id = p.note_id
WHERE p.note_id = sqlc.arg(note_id) AND n.user_id = sqlc.arg(user_id)
ORDER BY p.ply;

-- name: UpsertPly :one
WITH note AS (
  UPDATE notes
  SET updated_at = sqlc.arg(now)
  WHERE id = sqlc.arg(note_id) AND user_id = sqlc.arg(user_id)
  RETURNING id
)
INSERT INTO plies(note_id, ply, comment, body, move_glyph, position_glyph, created_at, updated_at)
SELECT note.id, sqlc.arg(ply), sqlc.narg(comment), sqlc.narg(body), sqlc.narg(move_glyph), sqlc.narg(position_glyph),
       sqlc.arg(now), sqlc.arg(now)
FROM note
ON CONFLICT (note_id, ply) DO UPDATE
SET comment = EXCLUDED.comment,
    body = EXCLUDED.body,
    move_glyph = EXCLUDED.move_glyph,
    position_glyph = EXCLUDED.position_glyph,
    updated_at = EXCLUDED.updated_at
RETURNING *;

-- name: ClearPly :one
-- Removes all writing on a Ply. Counts 1 when the Note is the user's, whether
-- or not the Ply had any writing, and 0 when it is not found.
WITH note AS (
  UPDATE notes
  SET updated_at = sqlc.arg(now)
  WHERE id = sqlc.arg(note_id) AND user_id = sqlc.arg(user_id)
  RETURNING id
), cleared AS (
  DELETE FROM plies p
  USING note
  WHERE p.note_id = note.id AND p.ply = sqlc.arg(ply)
)
SELECT count(*) FROM note;
