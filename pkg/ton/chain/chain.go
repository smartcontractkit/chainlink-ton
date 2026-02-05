package chain

import (
	"context"
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/liteclient"
)

// CreateMultiLiteserverConnectionPool creates a single ConnectionPool containing all provided
// liteserver nodes. The pool natively handles load balancing, failover, and health monitoring.
// Partial connection failures are tolerated; an error is returned only if zero nodes connect.
func CreateMultiLiteserverConnectionPool(ctx context.Context, liteserverURLs []string) (*liteclient.ConnectionPool, error) {
	if len(liteserverURLs) == 0 {
		return nil, fmt.Errorf("no liteserver URLs provided")
	}

	pool := liteclient.NewConnectionPool()

	var connected int
	for _, u := range liteserverURLs {
		publicKey, hostPort, err := parseLiteserverURL(u)
		if err != nil {
			return nil, fmt.Errorf("invalid liteserver URL %q: %w", u, err)
		}
		if err = pool.AddConnection(ctx, hostPort, publicKey); err != nil {
			// tolerate partial failures — some nodes may be temporarily down
			continue
		}
		connected++
	}

	if connected == 0 {
		return nil, fmt.Errorf("failed to connect to any of %d liteserver nodes", len(liteserverURLs))
	}

	return pool, nil
}

// CreateLiteserverConnectionPool parses a liteserver:// URL and creates a connection pool
func CreateLiteserverConnectionPool(ctx context.Context, liteserverURL string) (*liteclient.ConnectionPool, error) {
	return CreateMultiLiteserverConnectionPool(ctx, []string{liteserverURL})
}

// parseLiteserverURL parses a liteserver:// URL and returns the public key and host:port
func parseLiteserverURL(liteserverURL string) (publicKey, hostPort string, err error) {
	// parse the liteserver URL, format: liteserver://publickey@host:port
	if !strings.HasPrefix(liteserverURL, "liteserver://") {
		return "", "", fmt.Errorf("invalid liteserver URL format: expected liteserver:// prefix, got %s", liteserverURL)
	}

	// remove the liteserver:// prefix
	urlPart := strings.TrimPrefix(liteserverURL, "liteserver://")

	// split by @ to separate publickey and host:port
	parts := strings.Split(urlPart, "@")
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid liteserver URL format: expected publickey@host:port, got %s", liteserverURL)
	}

	publicKey, hostPort = parts[0], parts[1]

	return publicKey, hostPort, nil
}
