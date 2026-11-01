// Package mailertest provides a Mailer for tests that records what was sent.
package mailertest

import (
	"context"
	"sync"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/mailer"
)

type Recorder struct {
	mu   sync.Mutex
	sent []mailer.Message
}

func (r *Recorder) Send(_ context.Context, msg mailer.Message) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sent = append(r.sent, msg)
	return nil
}

func (r *Recorder) Sent() []mailer.Message {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]mailer.Message(nil), r.sent...)
}
