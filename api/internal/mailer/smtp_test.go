package mailer

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"regexp"
	"strings"
	"testing"
	"time"
)

var verification = Message{
	To:      "ada@example.com",
	Subject: "Verify your LuChess email",
	Text: "Welcome to LuChess!\n\n" +
		"Confirm your email address by opening this link within 24 hours:\n\n" +
		"https://luchess.test/verify-email?token=3q2-7wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n\n" +
		"If you did not create an account, you can ignore this email.\n",
}

// dialing sends the mailer to the test server whatever port it asks for, and
// records the address it asked for.
func dialing(s *testServer, asked *string) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		*asked = addr
		return (&net.Dialer{}).DialContext(ctx, network, s.ln.Addr().String())
	}
}

// assertDelivered checks the envelope and the email the server received against msg.
func assertDelivered(t *testing.T, s *testServer, msg Message) {
	t.Helper()
	s.mu.Lock()
	mailFrom, rcptTo, data := s.mailFrom, s.rcptTo, s.data
	s.mu.Unlock()

	if !strings.HasPrefix(mailFrom, "MAIL FROM:<no-reply@luchess.test>") {
		t.Errorf("envelope sender = %q, want no-reply@luchess.test", mailFrom)
	}
	if len(rcptTo) != 1 || rcptTo[0] != "RCPT TO:<"+msg.To+">" {
		t.Errorf("envelope recipients = %q, want only %s", rcptTo, msg.To)
	}

	if strings.Contains(strings.ReplaceAll(data, "\r\n", ""), "\n") || strings.Contains(strings.ReplaceAll(data, "\r\n", ""), "\r") {
		t.Errorf("the email has a line that does not end in CRLF:\n%q", data)
	}
	for line := range strings.SplitSeq(data, "\r\n") {
		if len(line) > 78 {
			t.Errorf("line is %d characters long, want at most 78: %q", len(line), line)
		}
	}

	email, err := mail.ReadMessage(strings.NewReader(data))
	if err != nil {
		t.Fatalf("the email does not parse: %v\n%s", err, data)
	}
	from, err := mail.ParseAddress(email.Header.Get("From"))
	if err != nil || from.Name != "LuChess" || from.Address != "no-reply@luchess.test" {
		t.Errorf("From = %q, want LuChess <no-reply@luchess.test>", email.Header.Get("From"))
	}
	to, err := mail.ParseAddress(email.Header.Get("To"))
	if err != nil || to.Address != msg.To {
		t.Errorf("To = %q, want %s", email.Header.Get("To"), msg.To)
	}
	subject, err := new(mime.WordDecoder).DecodeHeader(email.Header.Get("Subject"))
	if err != nil || subject != msg.Subject {
		t.Errorf("Subject = %q, want %q", email.Header.Get("Subject"), msg.Subject)
	}
	if date, err := email.Header.Date(); err != nil || time.Since(date) > time.Minute || time.Since(date) < -time.Minute {
		t.Errorf("Date = %q, want now", email.Header.Get("Date"))
	}
	if id := email.Header.Get("Message-ID"); !regexp.MustCompile(`^<[0-9a-f]{32}@luchess\.test>$`).MatchString(id) {
		t.Errorf("Message-ID = %q, want a random id at the sender's domain", id)
	}
	if v := email.Header.Get("MIME-Version"); v != "1.0" {
		t.Errorf("MIME-Version = %q, want 1.0", v)
	}
	mediaType, params, err := mime.ParseMediaType(email.Header.Get("Content-Type"))
	if err != nil || mediaType != "text/plain" || !strings.EqualFold(params["charset"], "utf-8") {
		t.Errorf("Content-Type = %q, want text/plain in UTF-8", email.Header.Get("Content-Type"))
	}
	if enc := email.Header.Get("Content-Transfer-Encoding"); enc != "quoted-printable" {
		t.Fatalf("Content-Transfer-Encoding = %q, want quoted-printable", enc)
	}
	text, err := io.ReadAll(quotedprintable.NewReader(email.Body))
	if err != nil {
		t.Fatalf("decoding the text: %v", err)
	}
	if want := strings.ReplaceAll(msg.Text, "\n", "\r\n"); string(text) != want {
		t.Errorf("text = %q, want %q", text, want)
	}
}

func TestSMTPDeliversTheEmailOverSTARTTLS(t *testing.T) {
	s := startServer(t, &testServer{})

	if err := s.mailer().Send(t.Context(), verification); err != nil {
		t.Fatalf("Send: %v", err)
	}

	assertDelivered(t, s, verification)
	if username, password := s.credentials(t); username != testUsername || password != testPassword {
		t.Errorf("logged in as %q with password %q, want the configured credentials", username, password)
	}
	for _, c := range s.received() {
		verb, _, _ := strings.Cut(c.line, " ")
		if !c.encrypted && verb != "EHLO" && verb != "STARTTLS" {
			t.Errorf("%s was sent before TLS started", verb)
		}
	}
}

func TestSMTPDeliversTheEmailOverImplicitTLSOnPort465(t *testing.T) {
	s := startServer(t, &testServer{implicitTLS: true})
	m := s.mailer()
	m.Port = 465
	var asked string
	m.dial = dialing(s, &asked)

	if err := m.Send(t.Context(), verification); err != nil {
		t.Fatalf("Send: %v", err)
	}

	if asked != "127.0.0.1:465" {
		t.Errorf("connected to %s, want 127.0.0.1:465", asked)
	}
	assertDelivered(t, s, verification)
	if username, password := s.credentials(t); username != testUsername || password != testPassword {
		t.Errorf("logged in as %q with password %q, want the configured credentials", username, password)
	}
	for _, c := range s.received() {
		if !c.encrypted {
			t.Errorf("%q was sent outside TLS", c.line)
		}
	}
	if s.saw("STARTTLS") {
		t.Error("STARTTLS was sent on a connection that was already TLS")
	}
}

func TestSMTPDeliversTextAndSubjectsOutsideASCII(t *testing.T) {
	s := startServer(t, &testServer{})
	msg := Message{
		To:      "ada@example.com",
		Subject: "Zurück zu LuChess – ♞",
		Text:    "Schöne Grüße,\n\n.a line that starts with a dot\nand a long one: " + strings.Repeat("ż", 200) + "\n",
	}

	if err := s.mailer().Send(t.Context(), msg); err != nil {
		t.Fatalf("Send: %v", err)
	}

	assertDelivered(t, s, msg)
}

func TestSMTPSendsNothingWithoutVerifiedTLS(t *testing.T) {
	cases := []struct {
		name   string
		server *testServer
		// port465 makes the mailer use implicit TLS
		port465 bool
		// distrust leaves the server's certificate out of the mailer's roots
		distrust bool
		wantErr  string
	}{
		{
			name:    "the server does not offer STARTTLS",
			server:  &testServer{hideSTARTTLS: true},
			wantErr: "does not offer STARTTLS",
		},
		{
			name:    "the server offers STARTTLS and then refuses it",
			server:  &testServer{replies: map[string]string{"STARTTLS": "454 TLS not available"}},
			wantErr: "STARTTLS",
		},
		{
			name:     "the certificate after STARTTLS is not trusted",
			distrust: true,
			wantErr:  "certificate",
		},
		{
			name:     "the certificate on port 465 is not trusted",
			server:   &testServer{implicitTLS: true},
			port465:  true,
			distrust: true,
			wantErr:  "certificate",
		},
		{
			name:    "the server on port 465 answers in the clear",
			port465: true,
			wantErr: "TLS handshake",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.server == nil {
				tc.server = &testServer{}
			}
			s := startServer(t, tc.server)
			m := s.mailer()
			if tc.port465 {
				m.Port = 465
				var asked string
				m.dial = dialing(s, &asked)
			}
			if tc.distrust {
				m.rootCAs = nil
			}

			err := m.Send(t.Context(), verification)

			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("Send error = %v, want one about %q", err, tc.wantErr)
			}
			for _, verb := range []string{"AUTH", "MAIL", "RCPT", "DATA"} {
				if s.saw(verb) {
					t.Errorf("%s was sent to a server without verified TLS", verb)
				}
			}
		})
	}
}

// The standard library's PLAIN lets credentials through to "localhost" without
// TLS. The mailer's own must not.
func TestSMTPCredentialsAreRefusedToAnUnencryptedConnectionEvenOnLocalhost(t *testing.T) {
	auth := plainAuth{username: testUsername, password: testPassword}

	if _, _, err := auth.Start(&smtp.ServerInfo{Name: "localhost", TLS: false, Auth: []string{"PLAIN"}}); err == nil {
		t.Fatal("credentials were offered to an unencrypted connection")
	}
	if _, resp, err := auth.Start(&smtp.ServerInfo{Name: "localhost", TLS: true, Auth: []string{"PLAIN"}}); err != nil || len(resp) == 0 {
		t.Fatalf("over TLS: response = %q, error = %v, want the credentials", resp, err)
	}
}

func TestSMTPReturnsTheServersErrors(t *testing.T) {
	cases := []struct {
		name     string
		verb     string
		reply    string
		wantCode int
	}{
		{"the login is refused", "AUTH", "535 5.7.8 authentication failed", 535},
		{"the sender is refused", "MAIL", "550 5.7.1 sender not allowed", 550},
		{"the recipient is refused", "RCPT", "550 5.1.1 no such mailbox", 550},
		{"the email is refused", ".", "554 5.7.1 rejected as spam", 554},
		{"the server is busy", "DATA", "451 4.3.0 try again later", 451},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := startServer(t, &testServer{replies: map[string]string{tc.verb: tc.reply}})

			err := s.mailer().Send(t.Context(), verification)

			var reply *textproto.Error
			if !errors.As(err, &reply) || reply.Code != tc.wantCode {
				t.Fatalf("Send error = %v, want the server's %d", err, tc.wantCode)
			}
			s.mu.Lock()
			defer s.mu.Unlock()
			if s.data != "" {
				t.Errorf("the server accepted an email although Send failed:\n%s", s.data)
			}
		})
	}
}

func TestSMTPRefusesARecipientThatIsNotOnePlainAddress(t *testing.T) {
	for _, to := range []string{
		"ada@example.com\r\nBcc: eve@example.com",
		"ada@example.com\nBcc: eve@example.com",
		"ada@example.com>\r\nRCPT TO:<eve@example.com",
		"ada@example.com, eve@example.com",
		"Ada <ada@example.com>",
		"not an address",
		"",
	} {
		t.Run(to, func(t *testing.T) {
			s := startServer(t, &testServer{})
			msg := verification
			msg.To = to

			if err := s.mailer().Send(t.Context(), msg); err == nil {
				t.Fatal("Send accepted the recipient")
			}
			if got := s.received(); len(got) != 0 {
				t.Errorf("the server was contacted: %+v", got)
			}
		})
	}
}

func TestSMTPKeepsLineBreaksInASubjectOutOfTheHeaders(t *testing.T) {
	s := startServer(t, &testServer{})
	msg := verification
	msg.Subject = "Hello\r\nBcc: eve@example.com"

	if err := s.mailer().Send(t.Context(), msg); err != nil {
		t.Fatalf("Send: %v", err)
	}

	s.mu.Lock()
	data := s.data
	s.mu.Unlock()
	email, err := mail.ReadMessage(strings.NewReader(data))
	if err != nil {
		t.Fatalf("the email does not parse: %v", err)
	}
	if bcc := email.Header.Get("Bcc"); bcc != "" {
		t.Fatalf("the subject added a header: Bcc = %q", bcc)
	}
	if subject, _ := new(mime.WordDecoder).DecodeHeader(email.Header.Get("Subject")); subject != msg.Subject {
		t.Errorf("Subject = %q, want %q", subject, msg.Subject)
	}
}

func TestSMTPLogsNothingAndItsErrorsCarryNoSecrets(t *testing.T) {
	var logged bytes.Buffer
	old := log.Writer()
	log.SetOutput(&logged)
	t.Cleanup(func() { log.SetOutput(old) })

	accepting := startServer(t, &testServer{})
	if err := accepting.mailer().Send(t.Context(), verification); err != nil {
		t.Fatalf("Send: %v", err)
	}
	var errs []string
	for _, replies := range []map[string]string{
		{"AUTH": "535 5.7.8 authentication failed"},
		{".": "554 5.7.1 rejected"},
	} {
		refusing := startServer(t, &testServer{replies: replies})
		err := refusing.mailer().Send(t.Context(), verification)
		if err == nil {
			t.Fatal("Send succeeded against a server that refuses")
		}
		errs = append(errs, err.Error())
	}

	if logged.Len() != 0 {
		t.Errorf("the SMTP mailer wrote to the log:\n%s", logged.String())
	}
	for _, secret := range []string{testPassword, testUsername, "token=", "verify-email", verification.To} {
		for _, text := range append(errs, logged.String()) {
			if strings.Contains(text, secret) {
				t.Errorf("%q appears in %q", secret, text)
			}
		}
	}
}

func TestSMTPGivesUpOnAServerThatNeverAnswers(t *testing.T) {
	s := startServer(t, &testServer{silent: true})
	m := s.mailer()
	m.timeout = 50 * time.Millisecond

	done := make(chan error, 1)
	go func() { done <- m.Send(context.Background(), verification) }()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("Send succeeded against a server that never answered")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Send was still waiting long after its timeout")
	}
}

func TestSMTPStopsWhenItsContextIsCancelled(t *testing.T) {
	s := startServer(t, &testServer{silent: true})
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	if err := s.mailer().Send(ctx, verification); err == nil {
		t.Fatal("Send succeeded with a cancelled context")
	}
}
