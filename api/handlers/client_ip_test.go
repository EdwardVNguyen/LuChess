package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	handler "github.com/EdwardVNguyen/LuChess/api/handlers"
)

// perIPLimited is every endpoint with a rate limit keyed by client address,
// each as a request that spends one event from that limit.
var perIPLimited = []struct {
	name string
	send func(a *app, tweak ...func(*http.Request)) *httptest.ResponseRecorder
}{
	{"sign up", func(a *app, tweak ...func(*http.Request)) *httptest.ResponseRecorder {
		return a.send(http.MethodPost, "/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword), tweak...)
	}},
	{"resend verification", func(a *app, tweak ...func(*http.Request)) *httptest.ResponseRecorder {
		return a.send(http.MethodPost, "/api/auth/resend-verification", resendBody("ada@example.com"), tweak...)
	}},
	{"login", func(a *app, tweak ...func(*http.Request)) *httptest.ResponseRecorder {
		return a.send(http.MethodPost, "/api/auth/login", loginBody("ada@example.com", "x"), tweak...)
	}},
	{"refresh", func(a *app, tweak ...func(*http.Request)) *httptest.ResponseRecorder {
		return a.refresh("", tweak...)
	}},
	{"forgot password", func(a *app, tweak ...func(*http.Request)) *httptest.ResponseRecorder {
		return a.send(http.MethodPost, "/api/auth/forgot-password", forgotBody("ada@example.com"), tweak...)
	}},
}

// onePerIP gives each client address a single request to every per-IP limit, so
// a second request that is let through must have been counted as someone else.
func onePerIP(c *handler.ApiConfig) {
	c.Limits.SignupPerIP = 1
	c.Limits.ResendPerIP = 1
	c.Limits.LoginPerIP = 1
	c.Limits.RefreshPerIP = 1
	c.Limits.ForgotPerIP = 1
}

func trustProxyHeaders(c *handler.ApiConfig) { c.TrustProxyHeaders = true }

func withHeader(name, value string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set(name, value) }
}

func assertNotRateLimited(t *testing.T, what string, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code == http.StatusTooManyRequests {
		t.Fatalf("%s: status = %d, want it let through", what, rec.Code)
	}
}

func TestRateLimitsIgnoreForwardingHeadersUnlessTrusted(t *testing.T) {
	a := newApp(t, onePerIP)

	for _, e := range perIPLimited {
		t.Run(e.name, func(t *testing.T) {
			first := e.send(a, a.fromIP("203.0.113.7"), withHeader("CF-Connecting-IP", "198.51.100.1"))
			assertNotRateLimited(t, "the first request", first)

			// The same connection claiming to be someone else gets no new budget
			for _, header := range []string{"CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"} {
				assertTooManyRequests(t, e.send(a, a.fromIP("203.0.113.7"), withHeader(header, "198.51.100.2")))
			}

			// And another connection is not charged for an address it only names
			other := e.send(a, a.fromIP("198.51.100.9"), withHeader("CF-Connecting-IP", "198.51.100.1"))
			assertNotRateLimited(t, "another connection naming a spent address", other)
		})
	}
}

func TestRateLimitsUseCFConnectingIPWhenTrusted(t *testing.T) {
	a := newApp(t, onePerIP, trustProxyHeaders)
	// Every request reaches the API from the proxy
	proxy := a.fromIP("127.0.0.1")

	for _, e := range perIPLimited {
		t.Run(e.name, func(t *testing.T) {
			first := e.send(a, proxy, withHeader("CF-Connecting-IP", "203.0.113.7"))
			assertNotRateLimited(t, "a visitor's first request", first)
			assertTooManyRequests(t, e.send(a, proxy, withHeader("CF-Connecting-IP", "203.0.113.7")))

			other := e.send(a, proxy, withHeader("CF-Connecting-IP", "198.51.100.9"))
			assertNotRateLimited(t, "another visitor through the same proxy", other)

			// Only Cloudflare's header is trusted; the others stay forgeable
			for _, header := range []string{"X-Forwarded-For", "X-Real-IP"} {
				assertTooManyRequests(t, e.send(a, proxy,
					withHeader("CF-Connecting-IP", "203.0.113.7"), withHeader(header, "198.51.100.2")))
			}
		})
	}
}

func TestRateLimitsFallBackToTheConnectionWhenCFConnectingIPIsMissingOrInvalid(t *testing.T) {
	a := newApp(t, onePerIP, trustProxyHeaders)

	for _, e := range perIPLimited {
		t.Run(e.name, func(t *testing.T) {
			assertNotRateLimited(t, "no header", e.send(a, a.fromIP("203.0.113.7")))

			// Each of these counts against the connection, which has spent its request
			for _, value := range []string{"", "not-an-address", "203.0.113", "198.51.100.2:443", "198.51.100.2, 198.51.100.3", "fe80::1%eth0"} {
				rec := e.send(a, a.fromIP("203.0.113.7"), withHeader("CF-Connecting-IP", value))
				if rec.Code != http.StatusTooManyRequests {
					t.Fatalf("CF-Connecting-IP %q: status = %d, want %d", value, rec.Code, http.StatusTooManyRequests)
				}
			}

			other := e.send(a, a.fromIP("198.51.100.9"), withHeader("CF-Connecting-IP", "not-an-address"))
			assertNotRateLimited(t, "another connection with an invalid header", other)
		})
	}
}

func TestRateLimitsCountTwoSpellingsOfOneAddressTogether(t *testing.T) {
	a := newApp(t, onePerIP, trustProxyHeaders)
	proxy := a.fromIP("127.0.0.1")

	for _, e := range perIPLimited {
		t.Run(e.name, func(t *testing.T) {
			first := e.send(a, proxy, withHeader("CF-Connecting-IP", "2001:db8::1"))
			assertNotRateLimited(t, "the first spelling", first)

			for _, spelling := range []string{"2001:DB8::1", "2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8:0:0:0:0:0:1"} {
				rec := e.send(a, proxy, withHeader("CF-Connecting-IP", spelling))
				if rec.Code != http.StatusTooManyRequests {
					t.Fatalf("CF-Connecting-IP %q: status = %d, want %d", spelling, rec.Code, http.StatusTooManyRequests)
				}
			}
		})
	}
}
