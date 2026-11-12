-- The Link index is written only where a Move's writing is saved, inside that
-- transaction, and every read is scoped to the owner.

-- name: ListMoveLinkTargets :many
-- The targets already indexed on one Move, in either part. A save may keep
-- these even when the target is gone, so an Unresolved Link stays editable.
SELECT DISTINCT target_id
FROM links
WHERE move_id = sqlc.arg(move_id);

-- name: ListOwnedNoteIDs :many
SELECT id
FROM notes
WHERE user_id = sqlc.arg(user_id) AND id = ANY(sqlc.arg(ids)::bigint[]);

-- name: DeleteMoveLinks :exec
DELETE FROM links
WHERE move_id = sqlc.arg(move_id);

-- name: InsertLinks :exec
-- The rows are a JSON array of {"move_id", "part", "target_id"}.
INSERT INTO links(move_id, part, target_id)
SELECT r.move_id, r.part, r.target_id
FROM jsonb_to_recordset(sqlc.arg(rows)::jsonb) AS r(move_id bigint, part text, target_id bigint);

-- name: ListLinkTargets :many
-- The Notes this Note's Comments and Bodies link to that still exist.
SELECT DISTINCT t.id, t.name, t.white, t.black, t.game_date
FROM links l
JOIN moves m ON m.id = l.move_id
JOIN notes s ON s.id = m.note_id
JOIN notes t ON t.id = l.target_id
WHERE m.note_id = sqlc.arg(note_id) AND s.user_id = sqlc.arg(user_id) AND t.user_id = sqlc.arg(user_id)
ORDER BY t.id;

-- name: ListBacklinks :many
-- The Comments and Bodies in other Notes that link to this one, in Main
-- lines or Variations, with the Move each is on: its SAN and its Ply.
WITH RECURSIVE linking AS (
  SELECT l.move_id, l.part
  FROM links l
  JOIN moves m ON m.id = l.move_id
  JOIN notes s ON s.id = m.note_id
  WHERE l.target_id = sqlc.arg(target_id) AND s.user_id = sqlc.arg(user_id) AND s.id <> sqlc.arg(target_id)
), chain AS (
  SELECT m.id AS move_id, m.parent_id, 0 AS depth
  FROM moves m
  WHERE m.id IN (SELECT move_id FROM linking)
  UNION ALL
  SELECT c.move_id, p.parent_id, c.depth + 1
  FROM chain c
  JOIN moves p ON p.id = c.parent_id
), plies AS (
  SELECT move_id, max(depth)::int AS ply
  FROM chain
  GROUP BY move_id
)
SELECT s.id AS note_id, s.name, s.start_fen, m.id AS move_id, m.san, p.ply, l.part
FROM linking l
JOIN moves m ON m.id = l.move_id
JOIN notes s ON s.id = m.note_id
JOIN plies p ON p.move_id = l.move_id
ORDER BY s.name, s.id, p.ply, m.id, l.part DESC;
