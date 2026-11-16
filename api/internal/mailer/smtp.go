package mailer

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

const (
	// The one port where TLS starts with the connection. Every other port starts
	// in the clear and has to be upgraded with STARTTLS.
	implicitTLSPort = 465
	// How long one send may take from connecting to the server's last reply, so a
	// stuck provider cannot hold a send forever.
	defaultSMTPTimeout = 30 * time.Second
	// What the API calls itself when it greets the server
	localName = "localhost"
)

// SMTP sends emails through an SMTP server, so the provider is a deployment
// choice. It speaks only over verified TLS and logs nothing: its errors carry
// the server's replies, never the credentials or what an email says.
type SMTP struct {
	Host     string
	Port     int
	Username string
	Password string
	// From is the sender: an address, or a name and address such as
	// "LuChess <no-reply@example.com>"
	From string

	// Tests set these to reach a local server with a self-signed certificate.
	// Nothing outside this package can, so production always verifies the
	// server against the system's roots.
	rootCAs *x509.CertPool
	dial    func(ctx context.Context, network, addr string) (net.Conn, error)
	timeout time.Duration
}

func (s SMTP) Send(ctx context.Context, msg Message) error {
	from, err := mail.ParseAddress(s.From)
	if err != nil {
		return fmt.Errorf("smtp: sender address: %w", err)
	}
	to, err := recipient(msg.To)
	if err != nil {
		return fmt.Errorf("smtp: recipient address: %w", err)
	}
	data, err := buildMessage(from, to, msg)
	if err != nil {
		return fmt.Errorf("smtp: building the message: %w", err)
	}

	timeout := s.timeout
	if timeout == 0 {
		timeout = defaultSMTPTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	dial := s.dial
	if dial == nil {
		dial = (&net.Dialer{}).DialContext
	}
	raw, err := dial(ctx, "tcp", net.JoinHostPort(s.Host, strconv.Itoa(s.Port)))
	if err != nil {
		return fmt.Errorf("smtp: connecting: %w", err)
	}
	defer raw.Close()
	// Every read and write below fails once ctx is done, by timeout or by its caller
	stop := context.AfterFunc(ctx, func() { raw.SetDeadline(time.Now()) })
	defer stop()

	tlsConfig := &tls.Config{ServerName: s.Host, RootCAs: s.rootCAs, MinVersion: tls.VersionTLS12}
	conn := raw
	if s.Port == implicitTLSPort {
		tlsConn := tls.Client(raw, tlsConfig)
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return fmt.Errorf("smtp: TLS handshake: %w", err)
		}
		conn = tlsConn
	}
	c, err := smtp.NewClient(conn, s.Host)
	if err != nil {
		return fmt.Errorf("smtp: greeting: %w", err)
	}
	if err := c.Hello(localName); err != nil {
		return fmt.Errorf("smtp: hello: %w", err)
	}
	if s.Port != implicitTLSPort {
		// smtp.SendMail would carry on in the clear here. A server that does not
		// offer STARTTLS gets nothing: no credentials and no email.
		if ok, _ := c.Extension("STARTTLS"); !ok {
			return errors.New("smtp: the server does not offer STARTTLS, and nothing is sent without TLS")
		}
		if err := c.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("smtp: STARTTLS: %w", err)
		}
	}

	if err := c.Auth(plainAuth{username: s.Username, password: s.Password}); err != nil {
		return fmt.Errorf("smtp: authenticating: %w", err)
	}
	if err := c.Mail(from.Address); err != nil {
		return fmt.Errorf("smtp: sender: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("smtp: recipient: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp: message: %w", err)
	}
	if _, err := w.Write(data); err != nil {
		return fmt.Errorf("smtp: message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp: message: %w", err)
	}
	// The server has accepted the email; a failed goodbye does not unsend it
	c.Quit()
	return nil
}

// plainAuth is AUTH PLAIN that refuses every connection without TLS.
// smtp.PlainAuth makes an exception for localhost; this makes none.
type plainAuth struct {
	username, password string
}

func (a plainAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if !server.TLS {
		return "", nil, errors.New("refusing to send credentials over an unencrypted connection")
	}
	return "PLAIN", []byte("\x00" + a.username + "\x00" + a.password), nil
}

func (a plainAuth) Next(_ []byte, more bool) ([]byte, error) {
	if more {
		return nil, errors.New("unexpected challenge from the server")
	}
	return nil, nil
}

// recipient checks that to is one plain address. It comes from a user, so a
// line break in it must never reach a header or an SMTP command.
func recipient(to string) (string, error) {
	if strings.ContainsAny(to, "\r\n") {
		return "", errors.New("contains a line break")
	}
	addr, err := mail.ParseAddress(to)
	if err != nil {
		return "", err
	}
	if addr.Address != to {
		return "", errors.New("not a plain email address")
	}
	return to, nil
}

// buildMessage writes the email as it goes over the wire: headers, a blank
// line, then the text as quoted-printable UTF-8, every line ending in CRLF.
func buildMessage(from *mail.Address, to string, msg Message) ([]byte, error) {
	id, err := messageID(from.Address)
	if err != nil {
		return nil, err
	}
	var b bytes.Buffer
	header := func(name, value string) {
		b.WriteString(name + ": " + value + "\r\n")
	}
	header("From", from.String())
	header("To", (&mail.Address{Address: to}).String())
	// Encodes anything outside printable ASCII, line breaks included
	header("Subject", mime.QEncoding.Encode("utf-8", msg.Subject))
	header("Date", time.Now().Format(time.RFC1123Z))
	header("Message-ID", id)
	header("MIME-Version", "1.0")
	header("Content-Type", `text/plain; charset="utf-8"`)
	header("Content-Transfer-Encoding", "quoted-printable")
	b.WriteString("\r\n")

	body := quotedprintable.NewWriter(&b)
	if _, err := body.Write([]byte(msg.Text)); err != nil {
		return nil, err
	}
	if err := body.Close(); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

// messageID is a fresh Message-ID at the sender's domain.
func messageID(sender string) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return "<" + hex.EncodeToString(raw) + "@" + sender[strings.LastIndex(sender, "@")+1:] + ">", nil
}
