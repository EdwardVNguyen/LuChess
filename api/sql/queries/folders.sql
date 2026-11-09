-- Every query is scoped to the owner, so another user's Folder is simply not found.

-- name: ListFolders :many
SELECT id, parent_id, name
FROM folders
WHERE user_id = sqlc.arg(user_id)
ORDER BY lower(name), id;

-- name: CreateFolder :one
INSERT INTO folders(user_id, parent_id, name, created_at, updated_at)
VALUES (sqlc.arg(user_id), sqlc.narg(parent_id), sqlc.arg(name), sqlc.arg(now), sqlc.arg(now))
RETURNING *;

-- name: LockFolders :exec
-- Holds every Folder of the user while the tree is reshaped, so two moves
-- cannot cross into a cycle and a delete counts what it deletes.
SELECT id
FROM folders
WHERE user_id = sqlc.arg(user_id)
FOR UPDATE;

-- name: GetFolder :one
SELECT *
FROM folders
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);

-- name: UpdateFolder :one
UPDATE folders
SET name = sqlc.arg(name),
    parent_id = sqlc.narg(parent_id),
    updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
RETURNING *;

-- name: IsInFolderTree :one
-- Whether candidate is the Folder root or one of its subfolders, at any depth.
WITH RECURSIVE tree AS (
  SELECT f.id FROM folders f WHERE f.id = sqlc.arg(root) AND f.user_id = sqlc.arg(user_id)
  UNION
  SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id
)
SELECT EXISTS (SELECT 1 FROM tree t WHERE t.id = sqlc.arg(candidate)::bigint)::boolean AS inside;

-- name: CountFolderContents :one
-- What deleting the Folder root reaches: its subfolders at any depth, and the
-- Notes in it or in any of them.
WITH RECURSIVE tree AS (
  SELECT f.id FROM folders f WHERE f.id = sqlc.arg(root) AND f.user_id = sqlc.arg(user_id)
  UNION
  SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id
)
SELECT
  ((SELECT count(*) FROM tree) - 1)::bigint AS folders,
  (SELECT count(*) FROM notes n WHERE n.folder_id IN (SELECT id FROM tree))::bigint AS notes;

-- name: DeleteFolder :execrows
-- Its subfolders go with it, and their Notes move to the root (the foreign keys).
DELETE FROM folders
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);
