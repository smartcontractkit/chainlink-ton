package relay

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/config"
)

type mockAPIClient struct {
	ton.APIClientWrapped
}

// TestGetClient_CacheHit verifies the fast path: when a cached client exists
// with a valid TTL, GetClient returns it without creating a new connection pool.
func TestGetClient_CacheHit(t *testing.T) {
	t.Parallel()

	mock := &mockAPIClient{}
	c := &chain{
		id: "-3",
		cfg: &config.TOMLConfig{
			Nodes: config.Nodes{makeNode("node1")},
			Chain: config.Chain{ClientTTL: 10 * time.Minute},
		},
		lggr: logger.Sugared(logger.Nop()),
		sharedClient: &cachedClient{
			client:    mock,
			pool:      liteclient.NewConnectionPool(),
			timestamp: time.Now(),
		},
	}

	client, err := c.GetClient(context.Background())
	require.NoError(t, err)
	// must return the exact same cached instance, not a new client
	assert.Same(t, mock, client)
}

func makeNode(name string) *config.Node {
	n := name
	u := commonconfig.MustParseURL("liteserver://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=@192.0.2.1:1")
	return &config.Node{Name: &n, URL: u}
}
