package server_test

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/EdwardVNguyen/LuChess/api/internal/server"
)

// patience is how long a test waits for something that should happen at once
// before calling it stuck. Nothing waits this long when the server behaves.
const patience = 5 * time.Second

func listen(t *testing.T) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	return listener
}

// run starts srv on a port the OS picks. It returns the server's address, a
// function that begins the shutdown, and a channel carrying what Run returns.
func run(t *testing.T, srv *http.Server, grace time.Duration) (addr string, shutdown func(), done <-chan error) {
	t.Helper()
	listener := listen(t)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	result := make(chan error, 1)
	go func() { result <- server.Run(ctx, srv, listener, grace) }()
	return listener.Addr().String(), cancel, result
}

// await receives from ch, failing the test instead of hanging it if nothing comes.
func await[T any](t *testing.T, ch <-chan T, what string) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(patience):
		t.Fatalf("timed out waiting for %s", what)
		panic("unreachable")
	}
}

// get makes one request on a connection of its own, so nothing is left idle for Shutdown to wait on.
func get(url string) (status int, body string, err error) {
	client := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}, Timeout: patience}
	res, err := client.Get(url)
	if err != nil {
		return 0, "", err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	return res.StatusCode, string(data), err
}

type response struct {
	status int
	body   string
	err    error
}

// held is a handler that says when a request has reached it, then holds the
// request until release is closed.
func held(started chan<- struct{}, release <-chan struct{}) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started <- struct{}{}
		<-release
		io.WriteString(w, "finished")
	})
}

func TestNewSetsEveryTimeout(t *testing.T) {
	srv := server.New(http.NotFoundHandler())

	for name, got := range map[string]time.Duration{
		"ReadHeaderTimeout": srv.ReadHeaderTimeout,
		"ReadTimeout":       srv.ReadTimeout,
		"WriteTimeout":      srv.WriteTimeout,
		"IdleTimeout":       srv.IdleTimeout,
	} {
		if got <= 0 {
			t.Errorf("%s = %s, want it set", name, got)
		}
	}
	if srv.ReadHeaderTimeout > srv.ReadTimeout {
		t.Errorf("ReadHeaderTimeout %s is longer than ReadTimeout %s", srv.ReadHeaderTimeout, srv.ReadTimeout)
	}
}

func TestShutdownGraceFitsBeforeAContainerIsKilled(t *testing.T) {
	// Docker and Podman send SIGKILL 10 seconds after SIGTERM
	if server.ShutdownGrace <= 0 || server.ShutdownGrace >= 10*time.Second {
		t.Fatalf("ShutdownGrace = %s, want it between 0 and 10s", server.ShutdownGrace)
	}
}

func TestAConnectionThatSendsNothingIsClosed(t *testing.T) {
	srv := server.New(http.NotFoundHandler())
	// The production value, shortened so the test does not wait seconds for it
	srv.ReadHeaderTimeout = 50 * time.Millisecond
	addr, shutdown, done := run(t, srv, time.Second)

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// Our own deadline is only so a server that never closes fails the test instead of hanging it
	conn.SetReadDeadline(time.Now().Add(patience))
	n, err := conn.Read(make([]byte, 1))
	if n != 0 || !errors.Is(err, io.EOF) {
		t.Fatalf("read %d bytes, err = %v; want the server to close the connection (0 bytes, EOF)", n, err)
	}

	shutdown()
	if err := await(t, done, "Run to return"); err != nil {
		t.Fatalf("Run returned %v, want nil", err)
	}
}

func TestShutdownLetsARequestInFlightFinish(t *testing.T) {
	started, release := make(chan struct{}, 1), make(chan struct{})
	srv := server.New(held(started, release))
	shutdownBegan := make(chan struct{})
	srv.RegisterOnShutdown(func() { close(shutdownBegan) })
	addr, shutdown, done := run(t, srv, patience)

	answered := make(chan response, 1)
	go func() {
		status, body, err := get("http://" + addr + "/")
		answered <- response{status, body, err}
	}()
	await(t, started, "the request to reach the handler")

	shutdown()
	await(t, shutdownBegan, "the shutdown to begin")

	// From here the server takes no new connections...
	if conn, err := net.Dial("tcp", addr); err == nil {
		conn.Close()
		t.Error("a new connection was accepted after the shutdown began")
	}
	// ...and waits for the request it already has
	select {
	case err := <-done:
		t.Fatalf("Run returned %v while a request was in flight", err)
	default:
	}

	close(release)
	got := await(t, answered, "the response")
	if got.err != nil || got.status != http.StatusOK || got.body != "finished" {
		t.Fatalf("request in flight got status %d, body %q, err %v; want 200 %q", got.status, got.body, got.err, "finished")
	}
	if err := await(t, done, "Run to return"); err != nil {
		t.Fatalf("Run returned %v, want nil", err)
	}
}

func TestShutdownGivesUpOnARequestThatOutlastsTheGracePeriod(t *testing.T) {
	started, release := make(chan struct{}, 1), make(chan struct{})
	// Let the handler go once the test is over, whatever happened
	t.Cleanup(func() { close(release) })
	addr, shutdown, done := run(t, server.New(held(started, release)), 50*time.Millisecond)

	answered := make(chan response, 1)
	go func() {
		status, body, err := get("http://" + addr + "/")
		answered <- response{status, body, err}
	}()
	await(t, started, "the request to reach the handler")

	shutdown()
	if err := await(t, done, "Run to return"); err != nil {
		t.Fatalf("Run returned %v, want nil", err)
	}
	// The request was cut off: its connection closed with no response
	if got := await(t, answered, "the request to fail"); got.err == nil {
		t.Fatalf("request got status %d, body %q; want it cut off", got.status, got.body)
	}
}

func TestRunReportsAServerThatCannotServe(t *testing.T) {
	listener := listen(t)
	listener.Close()

	err := server.Run(context.Background(), server.New(http.NotFoundHandler()), listener, time.Second)
	if err == nil || errors.Is(err, http.ErrServerClosed) {
		t.Fatalf("Run returned %v, want the listener's error", err)
	}
}
