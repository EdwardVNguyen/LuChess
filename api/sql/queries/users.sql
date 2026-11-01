-- name: CreateUser :one
INSERT INTO users(email, password_hash, name, biography, avatar_url)
VALUES (
  $1,
  $2,
  $3,
  $4,
  $5
)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * 
FROM users
WHERE email = $1;

-- name: MarkEmailVerified :exec
UPDATE users
SET email_verified_at = COALESCE(email_verified_at, sqlc.arg(now)),
    updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id);
