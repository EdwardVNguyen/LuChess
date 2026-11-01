// Package mailer is the boundary between the API and whatever delivers email.
package mailer

import "context"

type Message struct {
	To      string
	Subject string
	Text    string
}

type Mailer interface {
	Send(ctx context.Context, msg Message) error
}
