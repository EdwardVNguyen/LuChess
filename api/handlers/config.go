package handler

import (
	"database/sql"
	"time"

	"github.com/EdwardVNguyen/LuChess/api/internal/database"
	"github.com/EdwardVNguyen/LuChess/api/internal/mailer"
	"github.com/EdwardVNguyen/LuChess/api/internal/password"
	"github.com/EdwardVNguyen/LuChess/api/internal/ratelimit"
	"github.com/EdwardVNguyen/LuChess/api/internal/session"
)

// RateLimits are requests allowed per hour; zero means use the default.
type RateLimits struct {
	SignupPerIP    int
	ResendPerEmail int
	ResendPerIP    int
	LoginPerEmail  int
	LoginPerIP     int
	RefreshPerIP   int
	ForgotPerEmail int
	ForgotPerIP    int
	// Password attempts to delete an account, per user
	DeletePerUser int
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
	// Session owns Sessions: starting, refreshing, ending and authenticating them
	Session *session.Service
	// CookieSecure marks the refresh cookie Secure. Keep it on everywhere except
	// where a browser refuses Secure cookies over plain HTTP.
	CookieSecure bool
	// TrustProxyHeaders takes the client address for the per-IP rate limits from
	// CF-Connecting-IP. Turn it on only where nothing reaches the API except
	// through Cloudflare, or a visitor can claim any address they like.
	TrustProxyHeaders bool
	// Now is the clock; nil means time.Now. Tests replace it to exercise expiry.
	Now func() time.Time

	// Built by NewRouter from Limits
	signupByIP, resendByEmail, resendByIP *ratelimit.Limiter
	loginByEmail, loginByIP, refreshByIP  *ratelimit.Limiter
	forgotByEmail, forgotByIP             *ratelimit.Limiter
	deleteByUser                          *ratelimit.Limiter
	sessionHTTP                           *sessionHTTP

	// A valid hash of a throwaway password, checked when a login names no account
	dummyHash string
}

const (
	defaultSignupPerIP    = 10
	defaultResendPerEmail = 5
	defaultResendPerIP    = 20
	defaultLoginPerEmail  = 10
	defaultLoginPerIP     = 30
	defaultRefreshPerIP   = 300
	defaultForgotPerEmail = 5
	defaultForgotPerIP    = 20
	defaultDeletePerUser  = 10
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
	cfg.loginByEmail = ratelimit.New(orDefault(cfg.Limits.LoginPerEmail, defaultLoginPerEmail))
	cfg.loginByIP = ratelimit.New(orDefault(cfg.Limits.LoginPerIP, defaultLoginPerIP))
	cfg.refreshByIP = ratelimit.New(orDefault(cfg.Limits.RefreshPerIP, defaultRefreshPerIP))
	cfg.forgotByEmail = ratelimit.New(orDefault(cfg.Limits.ForgotPerEmail, defaultForgotPerEmail))
	cfg.forgotByIP = ratelimit.New(orDefault(cfg.Limits.ForgotPerIP, defaultForgotPerIP))
	cfg.deleteByUser = ratelimit.New(orDefault(cfg.Limits.DeletePerUser, defaultDeletePerUser))
}

func (cfg *ApiConfig) now() time.Time {
	if cfg.Now != nil {
		return cfg.Now()
	}
	return time.Now()
}
