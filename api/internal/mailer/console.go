package mailer

import (
	"context"
	"io"
)

// Console writes emails to a writer instead of sending them, so links can be
// followed from the server log during local development.
type Console struct {
	Out io.Writer
}

func (c Console) Send(_ context.Context, msg Message) error {
	_, err := io.WriteString(c.Out, "\n---------- email (console mailer) ----------\n"+
		"To: "+msg.To+"\nSubject: "+msg.Subject+"\n\n"+msg.Text+
		"--------------------------------------------\n")
	return err
}
