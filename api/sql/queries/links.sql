-- The Link index is written only by HandlePutPly, inside the transaction that
-- saves the Ply, and every read is scoped to the owner.

-- name: ListPlyLinkTargets :many
-- The targets already indexed on one Ply, in either part. A save may keep
-- these even when the target is gone, so an Unresolved Link stays editable.
SELECT DISTINCT l.target_id
FROM links l
JOIN notes n ON n.id = l.note_id
WHERE l.note_id = sqlc.arg(note_id) AND l.ply = sqlc.arg(ply) AND n.user_id = sqlc.arg(user_id);

-- name: ListOwnedNoteIDs :many
SELECT id
FROM notes
WHERE user_id = sqlc.arg(user_id) AND id = ANY(sqlc.arg(ids)::bigint[]);

-- name: DeletePlyLinks :exec
DELETE FROM links
WHERE note_id = sqlc.arg(note_id) AND ply = sqlc.arg(ply);

-- name: InsertPlyLinks :exec
INSERT INTO links(note_id, ply, part, target_id)
SELECT sqlc.arg(note_id), sqlc.arg(ply), sqlc.arg(part), unnest(sqlc.arg(target_ids)::bigint[]);

-- name: ListLinkTargets :many
-- The Notes this Note's Comments and Bodies link to that still exist.
SELECT DISTINCT t.id, t.name, t.white, t.black, t.game_date
FROM links l
JOIN notes s ON s.id = l.note_id
JOIN notes t ON t.id = l.target_id
WHERE l.note_id = sqlc.arg(note_id) AND s.user_id = sqlc.arg(user_id) AND t.user_id = sqlc.arg(user_id)
ORDER BY t.id;

-- name: ListBacklinks :many
-- The Comments and Bodies in other Notes that link to this one.
SELECT s.id AS note_id, s.name, s.start_fen, l.ply, l.part
FROM links l
JOIN notes s ON s.id = l.note_id
WHERE l.target_id = sqlc.arg(target_id) AND s.user_id = sqlc.arg(user_id) AND s.id <> sqlc.arg(target_id)
ORDER BY s.name, s.id, l.ply, l.part DESC;
