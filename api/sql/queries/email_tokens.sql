-- name: CreateEmailToken :exec
INSERT INTO email_tokens(user_id, purpose, token_hash, expires_at)
VALUES ($1, $2, $3, $4);

-- Marks a token used and returns its user, but only if it is unused and not
-- expired. One statement, so a token cannot be spent twice.
-- name: ConsumeEmailToken :one
UPDATE email_tokens
SET used_at = sqlc.arg(now)
WHERE token_hash = sqlc.arg(token_hash)
  AND purpose = sqlc.arg(purpose)
  AND used_at IS NULL
  AND expires_at > sqlc.arg(now)
RETURNING user_id;

-- Whether ConsumeEmailToken would accept the token right now. Only a cheap
-- early refusal: it spends nothing, so ConsumeEmailToken still decides.
-- name: IsEmailTokenUsable :one
SELECT EXISTS (
  SELECT 1 FROM email_tokens
  WHERE token_hash = sqlc.arg(token_hash)
    AND purpose = sqlc.arg(purpose)
    AND used_at IS NULL
    AND expires_at > sqlc.arg(now)
)::boolean AS usable;

-- name: DeleteUnusedEmailTokens :exec
DELETE FROM email_tokens
WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL;
