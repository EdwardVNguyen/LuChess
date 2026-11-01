package handler

import (
	"database/sql"
	"time"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/mailer"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/password"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/ratelimit"
)

// RateLimits are requests allowed per hour; zero means use the default.
type RateLimits struct {
	SignupPerIP    int
	ResendPerEmail int
	ResendPerIP    int
}

type ApiConfig struct {
	Db *database.Queries
	// SQL is the connection behind Db, for handlers that need a transaction
	SQL *sql.DB
	// FrontendOrigin is the only origin allowed to call the API from a browser,
	// and the base of the links sent in emails
	FrontendOrigin string
	Mailer         mailer.Mailer
	Hasher         password.Hasher
	Limits         RateLimits
	// Now is the clock; nil means time.Now. Tests replace it to exercise expiry.
	Now func() time.Time

	// Built by NewRouter from Limits
	signupByIP, resendByEmail, resendByIP *ratelimit.Limiter
}

const (
	defaultSignupPerIP    = 10
	defaultResendPerEmail = 5
	defaultResendPerIP    = 20
)

func (cfg *ApiConfig) buildLimiters() {
	orDefault := func(n, def int) int {
		if n <= 0 {
			return def
		}
		return n
	}
	cfg.signupByIP = ratelimit.New(orDefault(cfg.Limits.SignupPerIP, defaultSignupPerIP))
	cfg.resendByEmail = ratelimit.New(orDefault(cfg.Limits.ResendPerEmail, defaultResendPerEmail))
	cfg.resendByIP = ratelimit.New(orDefault(cfg.Limits.ResendPerIP, defaultResendPerIP))
}

func (cfg *ApiConfig) now() time.Time {
	if cfg.Now != nil {
		return cfg.Now()
	}
	return time.Now()
}
