// Package ratelimit limits how often something keyed by a string (an IP, an
// email) can happen. State is in memory, which is fine for a single API
// instance; moving to several instances would need a shared store.
package ratelimit

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// sweepThreshold is how many keys we hold before dropping idle ones.
const sweepThreshold = 10_000

type Limiter struct {
	perHour int
	mu      sync.Mutex
	buckets map[string]*rate.Limiter
}

// New allows perHour events per key per hour: a burst of perHour, refilled evenly.
func New(perHour int) *Limiter {
	return &Limiter{perHour: perHour, buckets: make(map[string]*rate.Limiter)}
}

// Allow records one event for key at time now. When the key is over its limit
// it records nothing and returns how long to wait before trying again.
func (l *Limiter) Allow(key string, now time.Time) (ok bool, retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.buckets) >= sweepThreshold {
		l.sweep(now)
	}
	lim, found := l.buckets[key]
	if !found {
		lim = rate.NewLimiter(rate.Every(time.Hour/time.Duration(l.perHour)), l.perHour)
		l.buckets[key] = lim
	}

	r := lim.ReserveN(now, 1)
	if delay := r.DelayFrom(now); !r.OK() || delay > 0 {
		r.CancelAt(now)
		return false, max(delay, time.Second)
	}
	return true, 0
}

// sweep forgets keys that have fully refilled; they behave like new keys anyway.
func (l *Limiter) sweep(now time.Time) {
	for key, lim := range l.buckets {
		if lim.TokensAt(now) >= float64(l.perHour) {
			delete(l.buckets, key)
		}
	}
}
