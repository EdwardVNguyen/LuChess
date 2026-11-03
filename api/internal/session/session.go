// Package session owns what a Session is: how one starts, how its refresh token
// is rotated, when reuse counts as theft, and how access tokens are issued and
// checked. It knows nothing about HTTP.
package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"strconv"
	"time"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/golang-jwt/jwt/v5"
)

const (
	accessTokenTTL = 15 * time.Minute
	// A rotated refresh token is still accepted this long after it was exchanged
	leeway = 10 * time.Second
	// RefreshTokenTTL is how long a refresh token, and so a Session left idle, lasts.
	RefreshTokenTTL = 30 * 24 * time.Hour
)

// ErrEnded means a refresh token was not accepted: the Session has ended, or
// the token was never one. The caller must log in again.
var ErrEnded = errors.New("session: ended")

// ErrUnauthenticated means an access token was not accepted.
var ErrUnauthenticated = errors.New("session: unauthenticated")

type Config struct {
	DB *sql.DB
	// Secret signs access tokens (HS256).
	Secret []byte
	// Now is the clock; nil means time.Now.
	Now func() time.Time
}

type Service struct {
	db      *sql.DB
	queries *database.Queries
	secret  []byte
	clock   func() time.Time
}

func New(cfg Config) *Service {
	clock := cfg.Now
	if clock == nil {
		clock = time.Now
	}
	return &Service{db: cfg.DB, queries: database.New(cfg.DB), secret: cfg.Secret, clock: clock}
}

// Tokens is what a client holds for a Session.
type Tokens struct {
	Access  string
	Refresh string
}

// Start begins a Session for the user.
func (s *Service) Start(ctx context.Context, userID int32) (Tokens, error) {
	refresh, err := s.newRefreshToken(ctx, s.queries, userID)
	if err != nil {
		return Tokens{}, err
	}
	access, err := s.issueAccessToken(userID)
	if err != nil {
		return Tokens{}, err
	}
	return Tokens{Access: access, Refresh: refresh}, nil
}

// Refresh exchanges a refresh token for a new pair of tokens.
func (s *Service) Refresh(ctx context.Context, rawRefreshToken string) (database.User, Tokens, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	defer tx.Rollback()
	q := s.queries.WithTx(tx)

	userID, err := q.RotateRefreshToken(ctx, database.RotateRefreshTokenParams{
		TokenHash: hashToken(rawRefreshToken),
		Now:       sql.NullTime{Time: s.clock(), Valid: true},
	})
	if errors.Is(err, sql.ErrNoRows) {
		tx.Rollback()
		return s.refreshRotated(ctx, hashToken(rawRefreshToken))
	}
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	user, err := q.GetUserByID(ctx, userID)
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	refresh, err := s.newRefreshToken(ctx, q, userID)
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	if err := tx.Commit(); err != nil {
		return database.User{}, Tokens{}, err
	}
	access, err := s.issueAccessToken(userID)
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	return user, Tokens{Access: access, Refresh: refresh}, nil
}

// refreshRotated runs when a refresh token could not be rotated: it is unknown,
// expired, ended, or already exchanged. A token exchanged moments ago is accepted
// again and exchanged for a fresh one: two refreshes racing, or a client retrying
// after losing the response, look exactly like that. A token exchanged longer ago
// has leaked (the thief and the owner both hold it), so every session of that
// user is ended. Tokens that simply expired, or were ended by logout, are not a
// sign of theft.
func (s *Service) refreshRotated(ctx context.Context, hash []byte) (database.User, Tokens, error) {
	now := s.clock()
	stored, err := s.queries.GetRefreshToken(ctx, hash)
	if errors.Is(err, sql.ErrNoRows) {
		return database.User{}, Tokens{}, ErrEnded
	}
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	if !stored.ExpiresAt.After(now) || !stored.RotatedAt.Valid {
		return database.User{}, Tokens{}, ErrEnded
	}
	if now.Sub(stored.RotatedAt.Time) <= leeway {
		if stored.RevokedAt.Valid {
			return database.User{}, Tokens{}, ErrEnded
		}
		return s.exchange(ctx, stored.UserID)
	}
	if err := s.queries.RevokeUserRefreshTokens(ctx, database.RevokeUserRefreshTokensParams{
		UserID: stored.UserID,
		Now:    sql.NullTime{Time: now, Valid: true},
	}); err != nil {
		return database.User{}, Tokens{}, err
	}
	return database.User{}, Tokens{}, ErrEnded
}

// exchange gives the user a fresh pair of tokens in place of one just accepted.
func (s *Service) exchange(ctx context.Context, userID int32) (database.User, Tokens, error) {
	user, err := s.queries.GetUserByID(ctx, userID)
	if errors.Is(err, sql.ErrNoRows) {
		return database.User{}, Tokens{}, ErrEnded
	}
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	refresh, err := s.newRefreshToken(ctx, s.queries, userID)
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	access, err := s.issueAccessToken(userID)
	if err != nil {
		return database.User{}, Tokens{}, err
	}
	return user, Tokens{Access: access, Refresh: refresh}, nil
}

// End logs out the Session the refresh token belongs to. It is safe to call
// repeatedly or with an unknown token. The token is revoked, not rotated, so
// presenting it later is not a theft signal. The access token cannot be taken
// back, so it keeps working until it expires.
func (s *Service) End(ctx context.Context, rawRefreshToken string) error {
	if rawRefreshToken == "" {
		return nil
	}
	return s.queries.RevokeRefreshToken(ctx, database.RevokeRefreshTokenParams{
		TokenHash: hashToken(rawRefreshToken),
		Now:       sql.NullTime{Time: s.clock(), Valid: true},
	})
}

// Authenticate returns the user an access token was issued to.
func (s *Service) Authenticate(ctx context.Context, accessToken string) (database.User, error) {
	claims := &jwt.RegisteredClaims{}
	if _, err := jwt.ParseWithClaims(accessToken, claims,
		func(*jwt.Token) (any, error) { return s.secret, nil },
		// Only the algorithm we sign with, so a token cannot choose its own
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(s.clock),
	); err != nil {
		return database.User{}, ErrUnauthenticated
	}
	userID, err := strconv.ParseInt(claims.Subject, 10, 32)
	if err != nil {
		return database.User{}, ErrUnauthenticated
	}
	user, err := s.queries.GetUserByID(ctx, int32(userID))
	if errors.Is(err, sql.ErrNoRows) {
		return database.User{}, ErrUnauthenticated
	}
	return user, err
}

func (s *Service) issueAccessToken(userID int32) (string, error) {
	now := s.clock()
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   strconv.Itoa(int(userID)),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(accessTokenTTL)),
	}).SignedString(s.secret)
}

// newRefreshToken stores a new refresh token for the user and returns its value.
// q is the caller's handle, so a rotation can do this inside its transaction.
func (s *Service) newRefreshToken(ctx context.Context, q *database.Queries, userID int32) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	err := q.CreateRefreshToken(ctx, database.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: hashToken(token),
		ExpiresAt: s.clock().Add(RefreshTokenTTL),
	})
	return token, err
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
