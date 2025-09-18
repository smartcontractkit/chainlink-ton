package chain

import (
	"context"
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/liteclient"
)

// CreateLiteserverConnectionPool parses a liteserver:// URL and creates a connection pool
func CreateLiteserverConnectionPool(ctx context.Context, liteserverURL string) (*liteclient.ConnectionPool, error) {
	publicKey, hostPort, err := parseLiteserverURL(liteserverURL)
	if err != nil {
		return nil, err
	}

	connectionPool := liteclient.NewConnectionPool()
	err = connectionPool.AddConnection(ctx, hostPort, publicKey)
	if err != nil {
		return nil, fmt.Errorf("failed to add liteserver connection: %w", err)
	}

	return connectionPool, nil
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
