-- Every query is scoped to the owner, so another user's Note is simply not found.

-- name: CreateNote :one
INSERT INTO notes(user_id, name, pgn, start_fen, created_at, updated_at)
VALUES (sqlc.arg(user_id), sqlc.arg(name), sqlc.arg(pgn), sqlc.narg(start_fen), sqlc.arg(now), sqlc.arg(now))
RETURNING *;

-- name: GetNote :one
SELECT *
FROM notes
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);

-- name: ListNotes :many
SELECT id, name, created_at, updated_at
FROM notes
WHERE user_id = sqlc.arg(user_id)
ORDER BY updated_at DESC, id DESC;

-- name: RenameNote :one
UPDATE notes
SET name = sqlc.arg(name),
    updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
RETURNING *;

-- name: DeleteNote :execrows
DELETE FROM notes
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);
