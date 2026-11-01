-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens(user_id, token_hash, expires_at)
VALUES ($1, $2, $3);

-- Exchanges a token: marks it used and returns its user, but only if it is
-- unrevoked and unexpired. One statement, so a token cannot be used twice.
-- name: RotateRefreshToken :one
UPDATE refresh_tokens
SET rotated_at = sqlc.arg(now), revoked_at = sqlc.arg(now)
WHERE token_hash = sqlc.arg(token_hash)
  AND revoked_at IS NULL
  AND expires_at > sqlc.arg(now)
RETURNING user_id;

-- name: GetRefreshToken :one
SELECT *
FROM refresh_tokens
WHERE token_hash = $1;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens
SET revoked_at = COALESCE(revoked_at, sqlc.arg(now))
WHERE token_hash = sqlc.arg(token_hash);

-- name: RevokeUserRefreshTokens :exec
UPDATE refresh_tokens
SET revoked_at = sqlc.arg(now)
WHERE user_id = sqlc.arg(user_id) AND revoked_at IS NULL;
