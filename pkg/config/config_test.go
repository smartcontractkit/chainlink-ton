package config

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

func TestChain_TxManager(t *testing.T) {
	customConfig := &txm.Config{BroadcastChanSize: 200}
	chain := &Chain{TransactionManager: customConfig}

	// Returns configured config when set
	assert.Equal(t, customConfig, chain.TxManager())

	// Returns default when nil
	chain.TransactionManager = nil
	assert.Equal(t, &txm.DefaultConfigSet, chain.TxManager())
}

func TestChain_LogPollerConfig(t *testing.T) {
	customConfig := &logpoller.Config{PageSize: 50}
	chain := &Chain{LogPoller: customConfig}

	// Returns configured config when set
	assert.Equal(t, customConfig, chain.LogPollerConfig())

	// Returns default when nil
	chain.LogPoller = nil
	assert.Equal(t, &logpoller.DefaultConfigSet, chain.LogPollerConfig())
}

func TestDefaultConfigSet(t *testing.T) {
	require.NotNil(t, DefaultConfigSet.TransactionManager)
	require.NotNil(t, DefaultConfigSet.LogPoller)
	assert.Equal(t, 10*time.Minute, DefaultConfigSet.ClientTTL)
}
