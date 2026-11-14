-- A Note's tree of Moves (ADR 0009). Reads are scoped to the owner, so
-- another user's Moves are simply not found. Every write runs after LockNote,
-- in the same transaction, which has already scoped the Note to its owner.

-- name: ListMoves :many
-- The root first, then every Move with its siblings in order.
SELECT m.*
FROM moves m
JOIN notes n ON n.id = m.note_id
WHERE m.note_id = sqlc.arg(note_id) AND n.user_id = sqlc.arg(user_id)
ORDER BY m.parent_id NULLS FIRST, m.ord, m.id;

-- name: GetMove :one
SELECT *
FROM moves
WHERE id = sqlc.arg(id) AND note_id = sqlc.arg(note_id);

-- name: GetChildBySAN :one
SELECT *
FROM moves
WHERE parent_id = sqlc.arg(parent_id) AND san = sqlc.arg(san);

-- name: CountMoves :one
-- The Note's Moves, not counting the root.
SELECT count(*)
FROM moves
WHERE note_id = sqlc.arg(note_id) AND parent_id IS NOT NULL;

-- name: AddMove :one
-- A new last child of the parent.
INSERT INTO moves(note_id, parent_id, ord, san, created_at, updated_at)
SELECT sqlc.arg(note_id), sqlc.arg(parent_id),
       coalesce((SELECT max(s.ord) + 1 FROM moves s WHERE s.parent_id = sqlc.arg(parent_id)), 0),
       sqlc.arg(san), sqlc.arg(now), sqlc.arg(now)
RETURNING *;

-- name: NextMoveIDs :many
-- IDs for an imported tree, so its rows can name their parents before they exist.
SELECT nextval('moves_id_seq')::bigint AS id
FROM generate_series(1, sqlc.arg(count)::int);

-- name: InsertMoves :exec
-- An imported tree in one statement, its rows given as a JSON array in
-- sibling order. A row with no parent_id is the root.
INSERT INTO moves(id, note_id, parent_id, ord, san, comment, body, move_glyph, position_glyph, drawings, created_at, updated_at)
SELECT r.id, sqlc.arg(note_id), r.parent_id, r.ord, r.san, r.comment, r.body, r.move_glyph, r.position_glyph,
       coalesce(r.drawings, '[]'), sqlc.arg(now), sqlc.arg(now)
FROM jsonb_to_recordset(sqlc.arg(rows)::jsonb) AS r(
  id bigint, parent_id bigint, ord int, san text, comment text, body text,
  move_glyph text, position_glyph text, drawings jsonb
);

-- name: UpdateMoveWriting :one
UPDATE moves
SET comment = sqlc.narg(comment),
    body = sqlc.narg(body),
    move_glyph = sqlc.narg(move_glyph),
    position_glyph = sqlc.narg(position_glyph),
    drawings = sqlc.arg(drawings),
    updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id) AND note_id = sqlc.arg(note_id)
RETURNING *;

-- name: CountSubtreeWriting :one
-- What deleting a Move and its subtree would delete: its Comments, Bodies,
-- Glyphs (each kind counted apart) and Drawings.
WITH RECURSIVE subtree AS (
  SELECT m.* FROM moves m WHERE m.id = sqlc.arg(id)
  UNION ALL
  SELECT c.* FROM moves c JOIN subtree s ON c.parent_id = s.id
)
SELECT count(comment)::bigint AS comments,
       count(body)::bigint AS bodies,
       (count(move_glyph) + count(position_glyph))::bigint AS glyphs,
       coalesce(sum(jsonb_array_length(drawings)), 0)::bigint AS drawings
FROM subtree;

-- name: DeleteMove :execrows
-- Deletes a Move and, by cascade, its subtree and the Links in its writing.
-- The root is never deleted this way.
DELETE FROM moves
WHERE id = sqlc.arg(id) AND note_id = sqlc.arg(note_id) AND parent_id IS NOT NULL;

-- name: PromoteMove :exec
-- Puts the Move on the Main line: it and each of its ancestors becomes its
-- parent's first child, unless it already is.
WITH RECURSIVE up AS (
  SELECT m.id, m.parent_id FROM moves m WHERE m.id = sqlc.arg(id)
  UNION ALL
  SELECT p.id, p.parent_id FROM moves p JOIN up ON p.id = up.parent_id
)
UPDATE moves m
SET ord = (SELECT min(s.ord) - 1 FROM moves s WHERE s.parent_id = m.parent_id)
FROM up
WHERE m.id = up.id AND m.parent_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM moves s
    WHERE s.parent_id = m.parent_id AND (s.ord < m.ord OR (s.ord = m.ord AND s.id < m.id))
  );

-- name: GetRoot :one
-- A Note's root, the Position.
SELECT *
FROM moves
WHERE note_id = sqlc.arg(note_id) AND parent_id IS NULL;

-- name: DeleteTree :exec
-- Deletes a Note's whole tree: its root and, by cascade, every Move and the
-- Links in their writing. Only to replace it with a new tree, on a reset.
DELETE FROM moves
WHERE note_id = sqlc.arg(note_id) AND parent_id IS NULL;

-- name: DeleteMoves :exec
-- Deletes Moves and, by cascade, their subtrees and the Links in their
-- writing, when a PGN applied to the Note no longer has them. The root is
-- never deleted this way.
DELETE FROM moves
WHERE note_id = sqlc.arg(note_id) AND id = ANY(sqlc.arg(ids)::bigint[]) AND parent_id IS NOT NULL;

-- name: SetMoveOrders :exec
-- Puts Moves in a new order among their siblings, as an applied PGN lists
-- them. The rows are a JSON array of {"id", "ord"}.
UPDATE moves m
SET ord = r.ord
FROM jsonb_to_recordset(sqlc.arg(rows)::jsonb) AS r(id bigint, ord int)
WHERE m.id = r.id AND m.note_id = sqlc.arg(note_id);
