package config

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/config"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

func TestNewDecodedTOMLConfig(t *testing.T) {
	t.Run("parses complete TOML config", func(t *testing.T) {
		tomlStr := `
Enabled = true
ChainID = '-3'
NetworkName = 'testnet'

[TransactionManager]
BroadcastChanSize = 200
SendRetryDelay = '5s'
CleanupIntervalMins = 15

[LogPoller]
PollPeriod = '10s'
PageSize = 50
BlockTime = '2500ms'

[[Nodes]]
Name = 'ton-testnet-1'
URL = 'http://localhost:8081'
`

		cfg, err := NewDecodedTOMLConfig(tomlStr)
		require.NoError(t, err)

		assert.True(t, cfg.IsEnabled())
		assert.Equal(t, "-3", cfg.ChainID)
		assert.Equal(t, "ton-testnet", cfg.NetworkNameFull)

		// Verify config sections exist and key fields parse correctly
		require.NotNil(t, cfg.TransactionManager)
		assert.Equal(t, uint(200), cfg.TransactionManager.BroadcastChanSize)
		assert.Equal(t, 5*time.Second, cfg.TransactionManager.SendRetryDelay.Duration())
		assert.Equal(t, uint(15), cfg.TransactionManager.CleanupIntervalMins)

		require.NotNil(t, cfg.LogPoller)
		assert.Equal(t, uint32(50), cfg.LogPoller.PageSize)
		assert.Equal(t, 10*time.Second, cfg.LogPoller.PollPeriod.Duration())
		assert.Equal(t, 2500*time.Millisecond, cfg.LogPoller.BlockTime.Duration())

		require.Len(t, cfg.Nodes, 1)
		assert.Equal(t, "ton-testnet-1", *cfg.Nodes[0].Name)
	})

	t.Run("applies defaults for missing sections", func(t *testing.T) {
		tomlStr := `
Enabled = true
ChainID = '-3'
NetworkName = 'testnet'

[[Nodes]]
Name = 'ton-testnet-1'  
URL = 'http://localhost:8081'
`

		cfg, err := NewDecodedTOMLConfig(tomlStr)
		require.NoError(t, err)

		// Missing sections should get full defaults
		assert.Equal(t, DefaultConfigSet.TransactionManager, cfg.TransactionManager)
		assert.Equal(t, DefaultConfigSet.LogPoller, cfg.LogPoller)
	})

	t.Run("partial configs get zero values", func(t *testing.T) {
		tomlStr := `
Enabled = true
ChainID = '-3'
NetworkName = 'testnet'

[TransactionManager]
BroadcastChanSize = 300

[LogPoller]
PageSize = 200

[[Nodes]]
Name = 'ton-testnet-1'
URL = 'http://localhost:8081'
`

		cfg, err := NewDecodedTOMLConfig(tomlStr)
		require.NoError(t, err)

		// Custom values preserved
		assert.Equal(t, uint(300), cfg.TransactionManager.BroadcastChanSize)
		assert.Equal(t, uint32(200), cfg.LogPoller.PageSize)

		// Missing fields get zero values (Aptos behavior)
		assert.Equal(t, uint(0), cfg.TransactionManager.ConfirmPollSecs)
		assert.Equal(t, uint(0), cfg.TransactionManager.CleanupIntervalMins)
		assert.Nil(t, cfg.TransactionManager.SendRetryDelay)
		assert.False(t, cfg.TransactionManager.StickyNodeContextEnabled)
	})

	t.Run("validation errors", func(t *testing.T) {
		// Invalid TOML syntax
		_, err := NewDecodedTOMLConfig("[TransactionManager # missing bracket")
		require.Error(t, err)

		// Missing ChainID
		_, err = NewDecodedTOMLConfig("Enabled = true\n[[Nodes]]\nName = 'test'\nURL = 'http://test'")
		require.Error(t, err)

		// Disabled config
		_, err = NewDecodedTOMLConfig("Enabled = false\nChainID = '1'\n[[Nodes]]\nName = 'test'\nURL = 'http://test'")
		require.Error(t, err)
	})
}

func TestTOMLConfig_SetDefaults(t *testing.T) {
	// Test nil configs get defaults
	cfg := &TOMLConfig{NetworkName: "testnet"}
	cfg.SetDefaults()

	assert.Equal(t, DefaultConfigSet.TransactionManager, cfg.TransactionManager)
	assert.Equal(t, DefaultConfigSet.LogPoller, cfg.LogPoller)
	assert.Equal(t, "ton-testnet", cfg.NetworkNameFull)

	// Test existing configs preserved
	customTxm := &txm.Config{BroadcastChanSize: 999}
	customLP := &logpoller.Config{PageSize: 777}

	cfg2 := &TOMLConfig{
		NetworkName:     "mainnet",
		NetworkNameFull: "custom-name",
		Chain: Chain{
			TransactionManager: customTxm,
			LogPoller:          customLP,
		},
	}
	cfg2.SetDefaults()

	assert.Equal(t, customTxm, cfg2.TransactionManager)
	assert.Equal(t, customLP, cfg2.LogPoller)
	assert.Equal(t, "custom-name", cfg2.NetworkNameFull)
}

func TestSetFromChain(t *testing.T) {
	source := &Chain{TransactionManager: &txm.Config{BroadcastChanSize: 500}}
	target := &Chain{}

	// Merges configs when source has them
	setFromChain(target, source)
	assert.Equal(t, source.TransactionManager, target.TransactionManager)

	// Preserves existing when source is nil
	existingTxm := &txm.Config{BroadcastChanSize: 100}
	target.TransactionManager = existingTxm
	setFromChain(target, &Chain{TransactionManager: nil})
	assert.Equal(t, existingTxm, target.TransactionManager)
}

func TestNodeValidation(t *testing.T) {
	// Valid node passes
	name := "test-node"
	url, _ := config.ParseURL("http://localhost:8081")
	node := &Node{Name: &name, URL: url}
	require.NoError(t, node.ValidateConfig())

	// Missing/empty name fails
	node.Name = nil
	require.Error(t, node.ValidateConfig())

	emptyName := ""
	node.Name = &emptyName
	require.Error(t, node.ValidateConfig())

	// Missing URL fails
	node.Name = &name
	node.URL = nil
	require.Error(t, node.ValidateConfig())
}
