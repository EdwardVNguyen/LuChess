// Package server builds the API's HTTP server and runs it until it is told to
// stop: it gives up on slow clients, and on the way out it lets requests in
// flight finish.
package server

import (
	"context"
	"log"
	"net"
	"net/http"
	"time"
)

// The largest request body is 1 MB (a Note's tree) and the slowest handlers
// hash a password, so these are generous for an honest client and still short
// enough that a stalled one cannot hold a connection for long.
const (
	// A connection that sends nothing, or dribbles its headers, is closed after this
	ReadHeaderTimeout = 5 * time.Second
	// The whole request, body included: 1 MB arrives well inside it on a poor connection
	ReadTimeout = 30 * time.Second
	// Counted from the end of the headers, so it covers reading the body, the
	// handler and writing the response; longer than ReadTimeout so that a body
	// which arrives slowly still leaves the handler time to answer
	WriteTimeout = 60 * time.Second
	// How long a keep-alive connection may wait for its next request. Longer than
	// the two minutes Caddy keeps its connections to the API open, so it is Caddy
	// that closes them, and it never sends a request down one we have just closed.
	IdleTimeout = 3 * time.Minute

	// ShutdownGrace is how long requests in flight get to finish after a stop
	// signal. A container runtime kills the process about 10 seconds after
	// SIGTERM, so this leaves room to finish up before that.
	ShutdownGrace = 5 * time.Second
)

// New builds the server for handler with every timeout set.
func New(handler http.Handler) *http.Server {
	return &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: ReadHeaderTimeout,
		ReadTimeout:       ReadTimeout,
		WriteTimeout:      WriteTimeout,
		IdleTimeout:       IdleTimeout,
	}
}

// Run serves on listener until ctx is done, then stops accepting connections
// and gives requests in flight up to grace to finish. It returns nil after a
// shutdown, whether or not every request finished in time, and the error if
// the server stops for any other reason.
func Run(ctx context.Context, srv *http.Server, listener net.Listener, grace time.Duration) error {
	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(listener) }()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	// ctx is already done, so the grace period needs a deadline of its own
	graceCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), grace)
	defer cancel()

	log.Printf("Shutting down: requests in flight have %s to finish\n", grace)
	if err := srv.Shutdown(graceCtx); err != nil {
		// The grace period ran out with requests still in flight; cut them off
		log.Printf("error: shutdown: %s; closing the connections that remain\n", err)
		srv.Close()
	}

	// Serve returns http.ErrServerClosed as soon as Shutdown is called; that is
	// the stop we asked for, not a failure
	<-serveErr
	return nil
}
