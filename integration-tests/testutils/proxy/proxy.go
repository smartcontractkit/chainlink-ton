package proxy

import (
	"context"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

const dialTimeout = time.Second

type Proxy struct {
	lggr      logger.Logger
	cancel    context.CancelFunc
	url       string
	target    string
	ln        net.Listener
	behaviour Behaviour
	mu        sync.Mutex
	// serverConns is a set of active connections that are being proxied. We keep track of them so we can close them when the proxy is closed.
	serverConns  map[net.Conn]struct{}
	stalledConns map[net.Conn]context.CancelFunc
}

type Behaviour int

const (
	BehaviourEnabled Behaviour = iota
	BehaviourStall
	BehaviourDisconnected
)

// New creates a new Proxy and starts it.
//
// It listens on a random local port and proxies connections to the given liteserver URL.
//
// The proxy can be configured to behave in different ways (enabled, stall, or disconnected) to simulate different network conditions.
func New(t *testing.T, rawURL string, behaviour Behaviour) *Proxy {
	t.Helper()

	publicKey, hostPort, err := splitLiteserverURL(rawURL)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(t.Context())
	var listenConfig net.ListenConfig
	ln, err := listenConfig.Listen(ctx, "tcp", "127.0.0.1:0")
	require.NoError(t, err)

	proxy := &Proxy{
		lggr:         logger.Named(logger.Test(t), "proxy"),
		cancel:       cancel,
		url:          fmt.Sprintf("liteserver://%s@%s", publicKey, ln.Addr().String()),
		target:       hostPort,
		ln:           ln,
		behaviour:    behaviour,
		serverConns:  make(map[net.Conn]struct{}),
		stalledConns: make(map[net.Conn]context.CancelFunc),
	}
	t.Cleanup(proxy.Close)

	go proxy.acceptLoop(ctx)

	return proxy
}

func splitLiteserverURL(rawURL string) (publicKey string, hostPort string, err error) {
	const prefix = "liteserver://"
	trimmedURL := strings.TrimPrefix(rawURL, prefix)
	if trimmedURL == rawURL {
		return "", "", fmt.Errorf("invalid liteserver URL %q: missing %s prefix", rawURL, prefix)
	}

	publicKey, hostPort, ok := strings.Cut(trimmedURL, "@")
	if !ok || publicKey == "" || hostPort == "" {
		return "", "", fmt.Errorf("invalid liteserver URL %q: expected publicKey@host:port", rawURL)
	}

	return publicKey, hostPort, nil
}

func (p *Proxy) URL() string {
	return p.url
}

func (p *Proxy) SetBehaviour(behaviour Behaviour) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.behaviour = behaviour
}

// Close closes the proxy and all active connections to it (including listener).
func (p *Proxy) Close() {
	p.cancel()

	p.mu.Lock()
	err := p.ln.Close()
	if err != nil {
		p.lggr.Errorf("Error closing listener: %v", err)
	}
	serverConns, stalledConns := p.drainConnectionsLocked()
	p.mu.Unlock()

	closeConnections(serverConns, stalledConns)
}

// DropConnections closes all active connections to the proxy. Useful for simulating a network failure or server going down.
func (p *Proxy) DropConnections() {
	p.mu.Lock()
	serverConns, stalledConns := p.drainConnectionsLocked()
	p.mu.Unlock()

	closeConnections(serverConns, stalledConns)
}

func (p *Proxy) acceptLoop(ctx context.Context) {
	for {
		clientConn, err := p.ln.Accept()
		if err != nil {
			return
		}

		var (
			connCtx    context.Context
			connCancel context.CancelFunc
		)
		p.mu.Lock()
		behaviour := p.behaviour
		switch behaviour {
		case BehaviourEnabled:
			p.serverConns[clientConn] = struct{}{}
		case BehaviourStall:
			connCtx, connCancel = context.WithCancel(ctx) //nolint:gosec // connCancel is stored in p.stalledConns and called when the connection is closed
			p.stalledConns[clientConn] = connCancel
		default:
		}
		p.mu.Unlock()

		switch behaviour {
		case BehaviourEnabled:
			go p.handle(ctx, clientConn)
		case BehaviourDisconnected:
			closeWithReset(clientConn)
			continue
		case BehaviourStall:
			go p.handleStall(connCtx, clientConn)
		}
	}
}

func (p *Proxy) handle(ctx context.Context, clientConn net.Conn) {
	defer p.forgetAndClose(clientConn)

	var dialer net.Dialer
	dialCtx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()

	serverConn, err := dialer.DialContext(dialCtx, "tcp", p.target)
	if err != nil {
		return
	}
	defer p.forgetAndClose(serverConn)

	p.mu.Lock()
	p.serverConns[serverConn] = struct{}{}
	p.mu.Unlock()

	done := make(chan struct{}, 2)
	go proxyCopy(done, clientConn, serverConn)
	go proxyCopy(done, serverConn, clientConn)
	<-done
}

// handleStall simulates an unhealthy RPC that completes the TCP connect and
// accepts the client's ADNL handshake bytes but never sends anything back, so
// the handshake never finishes. We drain (and discard) whatever the client
// sends so its writes never block, but we never reply. This wedges
// liteclient.AddConnection on its post-handshake `select` waiting for the
// connection result, which only unblocks once the caller's context is
// cancelled.
func (p *Proxy) handleStall(ctx context.Context, clientConn net.Conn) {
	defer p.forgetAndClose(clientConn)

	// Drain anything the client sends without ever responding.
	go func() { _, _ = io.Copy(io.Discard, clientConn) }()

	<-ctx.Done()
}

func (p *Proxy) forgetAndClose(conn net.Conn) {
	p.mu.Lock()
	delete(p.serverConns, conn)
	if cancel, ok := p.stalledConns[conn]; ok {
		cancel()
		delete(p.stalledConns, conn)
	}
	p.mu.Unlock()
	closeWithReset(conn)
}

func (p *Proxy) drainConnectionsLocked() (server map[net.Conn]struct{}, stalled map[net.Conn]context.CancelFunc) {
	server = p.serverConns
	stalled = p.stalledConns

	p.serverConns = make(map[net.Conn]struct{})
	p.stalledConns = make(map[net.Conn]context.CancelFunc)

	return
}

func closeConnections(serverConns map[net.Conn]struct{}, stalledConns map[net.Conn]context.CancelFunc) {
	for conn := range serverConns {
		closeWithReset(conn)
	}
	for stalledConn, cancel := range stalledConns {
		cancel()
		closeWithReset(stalledConn)
	}
}

func closeWithReset(conn net.Conn) {
	if tcpConn, ok := conn.(*net.TCPConn); ok {
		_ = tcpConn.SetLinger(0)
	}
	_ = conn.Close()
}

func proxyCopy(done chan<- struct{}, dst io.Writer, src io.Reader) {
	_, _ = io.Copy(dst, src)
	done <- struct{}{}
}
