package mailer

import (
	"bufio"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"math/big"
	"net"
	"strings"
	"sync"
	"testing"
	"time"
)

// testServer is a small SMTP server on a loopback port the OS chose. It
// records what a client sends, so tests can check the email and, as
// important, what was never sent.
type testServer struct {
	// implicitTLS starts TLS with the connection, as port 465 does
	implicitTLS bool
	// hideSTARTTLS leaves STARTTLS out of the EHLO reply, though AUTH is still offered
	hideSTARTTLS bool
	// silent accepts connections and never says a word
	silent bool
	// replies answers a command with this line instead of accepting it. The key
	// is the command's verb, or "." for the end of the message.
	replies map[string]string

	ln    net.Listener
	tls   *tls.Config
	roots *x509.CertPool
	conns sync.WaitGroup

	mu       sync.Mutex
	open     []net.Conn
	commands []command
	auth     string
	mailFrom string
	rcptTo   []string
	data     string
}

type command struct {
	line      string
	encrypted bool
}

func startServer(t *testing.T, s *testServer) *testServer {
	t.Helper()
	cert, roots := selfSignedCert(t)
	s.tls = &tls.Config{Certificates: []tls.Certificate{cert}}
	s.roots = roots
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listening: %v", err)
	}
	s.ln = ln
	accepting := make(chan struct{})
	go func() {
		defer close(accepting)
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			s.mu.Lock()
			s.open = append(s.open, conn)
			s.mu.Unlock()
			s.conns.Go(func() { s.serve(conn) })
		}
	}()
	t.Cleanup(func() {
		ln.Close()
		<-accepting
		s.mu.Lock()
		for _, conn := range s.open {
			conn.Close()
		}
		s.mu.Unlock()
		s.conns.Wait()
	})
	return s
}

// mailer returns an SMTP mailer pointed at the server, trusting its certificate.
func (s *testServer) mailer() SMTP {
	return SMTP{
		Host:     "127.0.0.1",
		Port:     s.ln.Addr().(*net.TCPAddr).Port,
		Username: testUsername,
		Password: testPassword,
		From:     "LuChess <no-reply@luchess.test>",
		rootCAs:  s.roots,
	}
}

const (
	testUsername = "test-username"
	testPassword = "test-password-not-a-real-one"
)

func (s *testServer) serve(conn net.Conn) {
	defer conn.Close()
	if s.silent {
		// Returns when the client gives up and closes
		conn.Read(make([]byte, 1))
		return
	}
	encrypted := false
	if s.implicitTLS {
		conn = tls.Server(conn, s.tls)
		encrypted = true
	}
	r := bufio.NewReader(conn)
	say := func(line string) { conn.Write([]byte(line + "\r\n")) }

	say("220 test ESMTP")
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		verb, _, _ := strings.Cut(line, " ")
		verb = strings.ToUpper(verb)
		s.mu.Lock()
		s.commands = append(s.commands, command{line: line, encrypted: encrypted})
		s.mu.Unlock()

		if reply, ok := s.replies[verb]; ok {
			say(reply)
			continue
		}
		switch verb {
		case "EHLO":
			say("250-test")
			if !encrypted && !s.hideSTARTTLS {
				say("250-STARTTLS")
			}
			say("250 AUTH PLAIN")
		case "STARTTLS":
			say("220 go ahead")
			conn = tls.Server(conn, s.tls)
			r = bufio.NewReader(conn)
			encrypted = true
		case "AUTH":
			s.mu.Lock()
			s.auth = line
			s.mu.Unlock()
			say("235 authenticated")
		case "MAIL":
			s.mu.Lock()
			s.mailFrom = line
			s.mu.Unlock()
			say("250 ok")
		case "RCPT":
			s.mu.Lock()
			s.rcptTo = append(s.rcptTo, line)
			s.mu.Unlock()
			say("250 ok")
		case "DATA":
			say("354 go ahead")
			// Kept byte for byte, so tests can check the line endings
			var data strings.Builder
			for {
				line, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if line == ".\r\n" {
					break
				}
				data.WriteString(strings.TrimPrefix(line, "."))
			}
			if reply, ok := s.replies["."]; ok {
				say(reply)
				continue
			}
			s.mu.Lock()
			s.data = data.String()
			s.mu.Unlock()
			say("250 queued")
		case "QUIT":
			say("221 bye")
			return
		default:
			say("502 not implemented")
		}
	}
}

// received returns the commands the server got, each marked with whether it
// arrived inside TLS.
func (s *testServer) received() []command {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]command(nil), s.commands...)
}

// saw reports whether any received command starts with verb.
func (s *testServer) saw(verb string) bool {
	for _, c := range s.received() {
		if strings.HasPrefix(strings.ToUpper(c.line), verb) {
			return true
		}
	}
	return false
}

// credentials returns the username and password of the AUTH PLAIN command.
func (s *testServer) credentials(t *testing.T) (username, password string) {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(s.auth, "AUTH PLAIN "))
	if err != nil {
		t.Fatalf("decoding %q: %v", s.auth, err)
	}
	parts := strings.Split(string(raw), "\x00")
	if len(parts) != 3 {
		t.Fatalf("AUTH PLAIN carried %d parts, want 3", len(parts))
	}
	return parts[1], parts[2]
}

// selfSignedCert makes a certificate for 127.0.0.1 and a pool that trusts only it.
func selfSignedCert(t *testing.T) (tls.Certificate, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generating a key: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "test SMTP server"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
		IPAddresses:           []net.IP{net.IPv4(127, 0, 0, 1)},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("creating a certificate: %v", err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parsing the certificate: %v", err)
	}
	roots := x509.NewCertPool()
	roots.AddCert(cert)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}, roots
}
