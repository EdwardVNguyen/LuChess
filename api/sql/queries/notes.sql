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

-- name: SearchNotes :many
-- Fuzzy-finds Notes by name, then by players: a Note matches when the query
-- is a substring of, or trigram-similar to a word in, its name or players.
-- Name matches rank above player-only matches; the pattern is a LIKE pattern
-- with its wildcards already escaped.
SELECT id, name, white, black, game_date, updated_at
FROM (
  SELECT n.*,
    CASE WHEN n.name ILIKE sqlc.arg(pattern)::text THEN 1 + word_similarity(sqlc.arg(query)::text, n.name)
         WHEN sqlc.arg(query)::text <% n.name THEN word_similarity(sqlc.arg(query)::text, n.name)
         ELSE 0 END AS name_score,
    CASE WHEN (coalesce(n.white, '') || ' ' || coalesce(n.black, '')) ILIKE sqlc.arg(pattern)::text
           THEN 1 + word_similarity(sqlc.arg(query)::text, coalesce(n.white, '') || ' ' || coalesce(n.black, ''))
         WHEN sqlc.arg(query)::text <% (coalesce(n.white, '') || ' ' || coalesce(n.black, ''))
           THEN word_similarity(sqlc.arg(query)::text, coalesce(n.white, '') || ' ' || coalesce(n.black, ''))
         ELSE 0 END AS players_score
  FROM notes n
  WHERE n.user_id = sqlc.arg(user_id)
    AND (n.name ILIKE sqlc.arg(pattern)::text
      OR sqlc.arg(query)::text <% n.name
      OR (coalesce(n.white, '') || ' ' || coalesce(n.black, '')) ILIKE sqlc.arg(pattern)::text
      OR sqlc.arg(query)::text <% (coalesce(n.white, '') || ' ' || coalesce(n.black, '')))
) ranked
ORDER BY name_score DESC, players_score DESC, updated_at DESC, id DESC
LIMIT sqlc.arg(max_results);

-- name: LockNote :one
-- Holds the Note while its moves are edited, so writing saved meanwhile waits
-- (saving a Ply touches the Note) and the confirmation counts what is deleted.
SELECT id
FROM notes
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
FOR UPDATE;

-- name: ReplaceNoteMoves :one
UPDATE notes
SET pgn = sqlc.arg(pgn),
    updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
RETURNING *;
