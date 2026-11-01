# Self-managed auth: short-lived JWT access tokens and opaque refresh tokens

The planning document chose Clerk; we decided to run authentication ourselves (argon2id passwords, email verification and password reset through a mailer, login blocked until the email is verified). Access tokens are 15-minute HS256 JWTs held in memory. Refresh tokens are random opaque strings in an `HttpOnly` cookie, stored only as hashes, rotated on every use, with reuse of a revoked token revoking the whole family. We rejected JWT refresh tokens because they would need the same database table for rotation and revocation, so signing them adds nothing.

## Consequences

We own the security burden: HTTPS only, locked-down CORS, rate limiting on login, forgot-password and resend-verification, and generic error messages. Because the frontend and API are deployed separately, they must share a registrable domain for the refresh cookie to work with `SameSite=Lax`, which requires a custom domain. A password reset revokes all of the user's refresh tokens. Access tokens cannot be revoked before they expire.
