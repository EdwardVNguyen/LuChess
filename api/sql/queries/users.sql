-- name: CreateUser :exec
INSERT INTO users(id, email, password_hash, name, biography, avatar_url)
VALUES (
  $1,
  $2,
  $3,
  $4,
  $5,
  $6
);
