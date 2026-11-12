-- Every query is scoped to the owner, so another user's Note is simply not found.

-- name: CreateNote :one
INSERT INTO notes(user_id, name, tags, start_fen, folder_id, created_at, updated_at)
VALUES (sqlc.arg(user_id), sqlc.arg(name), sqlc.arg(tags), sqlc.narg(start_fen), sqlc.narg(folder_id), sqlc.arg(now), sqlc.arg(now))
RETURNING *;

-- name: GetNote :one
SELECT *
FROM notes
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);

-- name: ListNotes :many
SELECT id, name, folder_id, created_at, updated_at
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
-- Fuzzy-finds Notes by name, players and Folder: a Note matches when the
-- query is a substring of, or trigram-similar to a word in, its name, its
-- players, or the names of the Folders it is filed in. Name matches rank
-- first, then players, then Folders; the pattern is a LIKE pattern with its
-- wildcards already escaped. folder_path lists the Folders from the root down.
WITH RECURSIVE paths AS (
  SELECT f.id, ARRAY[f.name::text] AS names
  FROM folders f
  WHERE f.user_id = sqlc.arg(user_id) AND f.parent_id IS NULL
  UNION ALL
  SELECT f.id, p.names || f.name::text
  FROM folders f
  JOIN paths p ON f.parent_id = p.id
)
SELECT id, name, white, black, game_date, folder_path::text[] AS folder_path, updated_at
FROM (
  SELECT n.id, n.name, n.white, n.black, n.game_date, n.updated_at,
    coalesce(p.names, '{}'::text[]) AS folder_path,
    CASE WHEN n.name ILIKE sqlc.arg(pattern)::text THEN 1 + word_similarity(sqlc.arg(query)::text, n.name)
         WHEN sqlc.arg(query)::text <% n.name THEN word_similarity(sqlc.arg(query)::text, n.name)
         ELSE 0 END AS name_score,
    CASE WHEN (coalesce(n.white, '') || ' ' || coalesce(n.black, '')) ILIKE sqlc.arg(pattern)::text
           THEN 1 + word_similarity(sqlc.arg(query)::text, coalesce(n.white, '') || ' ' || coalesce(n.black, ''))
         WHEN sqlc.arg(query)::text <% (coalesce(n.white, '') || ' ' || coalesce(n.black, ''))
           THEN word_similarity(sqlc.arg(query)::text, coalesce(n.white, '') || ' ' || coalesce(n.black, ''))
         ELSE 0 END AS players_score,
    CASE WHEN array_to_string(p.names, ' / ') ILIKE sqlc.arg(pattern)::text
           THEN 1 + word_similarity(sqlc.arg(query)::text, array_to_string(p.names, ' / '))
         WHEN sqlc.arg(query)::text <% array_to_string(p.names, ' / ')
           THEN word_similarity(sqlc.arg(query)::text, array_to_string(p.names, ' / '))
         ELSE 0 END AS folder_score
  FROM notes n
  LEFT JOIN paths p ON p.id = n.folder_id
  WHERE n.user_id = sqlc.arg(user_id)
) ranked
WHERE name_score > 0 OR players_score > 0 OR folder_score > 0
ORDER BY name_score DESC, players_score DESC, folder_score DESC, updated_at DESC, id DESC
LIMIT sqlc.arg(max_results);

-- name: SetNoteFolder :one
-- Filing a Note is not writing on it, so updated_at stays.
UPDATE notes
SET folder_id = sqlc.narg(folder_id)
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
RETURNING *;

-- name: LockNote :one
-- Holds the Note while its Moves are changed, so edits to its tree are
-- serialized and a confirmation counts exactly what is deleted.
SELECT id
FROM notes
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
FOR UPDATE;

-- name: TouchNote :exec
UPDATE notes
SET updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id);
