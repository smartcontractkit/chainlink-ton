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
BroadcastChanSize = 101
ConfirmPollInterval = '9s'
SendRetryDelay = '8s'
MaxSendRetryAttempts = 7
TxExpiration = '6h'
CleanupInterval = '15m'

[LogPoller]
PollPeriod = '10s'
PageSize = 50
LogPollerStartingLookback = '1h'
BlockTime = '1200ms'

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
		assert.Equal(t, uint(101), cfg.TransactionManager.BroadcastChanSize)
		assert.Equal(t, 9*time.Second, cfg.TransactionManager.ConfirmPollInterval.Duration())
		assert.Equal(t, 8*time.Second, cfg.TransactionManager.SendRetryDelay.Duration())
		assert.Equal(t, uint(7), cfg.TransactionManager.MaxSendRetryAttempts)
		assert.Equal(t, 6*time.Hour, cfg.TransactionManager.TxExpiration.Duration())
		assert.Equal(t, 15*time.Minute, cfg.TransactionManager.CleanupInterval.Duration())

		require.NotNil(t, cfg.LogPoller)
		assert.Equal(t, uint32(50), cfg.LogPoller.PageSize)
		assert.Equal(t, 10*time.Second, cfg.LogPoller.PollPeriod.Duration())
		assert.Equal(t, 1*time.Hour, cfg.LogPoller.LogPollerStartingLookback.Duration())
		assert.Equal(t, 1200*time.Millisecond, cfg.LogPoller.BlockTime.Duration())

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

		// Missing sections should get full defaults - verify field by field
		require.NotNil(t, cfg.TransactionManager)
		assert.Equal(t, txm.DefaultConfigSet.BroadcastChanSize, cfg.TransactionManager.BroadcastChanSize)
		assert.Equal(t, txm.DefaultConfigSet.ConfirmPollInterval, cfg.TransactionManager.ConfirmPollInterval)
		assert.Equal(t, txm.DefaultConfigSet.SendRetryDelay, cfg.TransactionManager.SendRetryDelay)
		assert.Equal(t, txm.DefaultConfigSet.MaxSendRetryAttempts, cfg.TransactionManager.MaxSendRetryAttempts)
		assert.Equal(t, txm.DefaultConfigSet.TxExpiration, cfg.TransactionManager.TxExpiration)
		assert.Equal(t, txm.DefaultConfigSet.CleanupInterval, cfg.TransactionManager.CleanupInterval)

		require.NotNil(t, cfg.LogPoller)
		assert.Equal(t, logpoller.DefaultConfigSet.PollPeriod, cfg.LogPoller.PollPeriod)
		assert.Equal(t, logpoller.DefaultConfigSet.PageSize, cfg.LogPoller.PageSize)
		assert.Equal(t, logpoller.DefaultConfigSet.LogPollerStartingLookback, cfg.LogPoller.LogPollerStartingLookback)
		assert.Equal(t, logpoller.DefaultConfigSet.BlockTime, cfg.LogPoller.BlockTime)
	})

	t.Run("partial configs get field-by-field defaults", func(t *testing.T) {
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

		// Missing fields get defaults applied (field-by-field)
		assert.Equal(t, txm.DefaultConfigSet.ConfirmPollInterval, cfg.TransactionManager.ConfirmPollInterval)
		assert.Equal(t, txm.DefaultConfigSet.SendRetryDelay, cfg.TransactionManager.SendRetryDelay)
		assert.Equal(t, txm.DefaultConfigSet.MaxSendRetryAttempts, cfg.TransactionManager.MaxSendRetryAttempts)
		assert.Equal(t, txm.DefaultConfigSet.TxExpiration, cfg.TransactionManager.TxExpiration)
		assert.Equal(t, txm.DefaultConfigSet.CleanupInterval, cfg.TransactionManager.CleanupInterval)

		assert.Equal(t, logpoller.DefaultConfigSet.PollPeriod, cfg.LogPoller.PollPeriod)
		assert.Equal(t, logpoller.DefaultConfigSet.LogPollerStartingLookback, cfg.LogPoller.LogPollerStartingLookback)
		assert.Equal(t, logpoller.DefaultConfigSet.BlockTime, cfg.LogPoller.BlockTime)
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
	t.Run("nil configs get full defaults", func(t *testing.T) {
		cfg := &TOMLConfig{NetworkName: "testnet"}
		cfg.SetDefaults()

		// Verify all TransactionManager fields got defaults
		require.NotNil(t, cfg.TransactionManager)
		assert.Equal(t, txm.DefaultConfigSet.BroadcastChanSize, cfg.TransactionManager.BroadcastChanSize)
		assert.Equal(t, txm.DefaultConfigSet.ConfirmPollInterval, cfg.TransactionManager.ConfirmPollInterval)
		assert.Equal(t, txm.DefaultConfigSet.SendRetryDelay, cfg.TransactionManager.SendRetryDelay)
		assert.Equal(t, txm.DefaultConfigSet.MaxSendRetryAttempts, cfg.TransactionManager.MaxSendRetryAttempts)
		assert.Equal(t, txm.DefaultConfigSet.TxExpiration, cfg.TransactionManager.TxExpiration)
		assert.Equal(t, txm.DefaultConfigSet.CleanupInterval, cfg.TransactionManager.CleanupInterval)

		// Verify all LogPoller fields got defaults
		require.NotNil(t, cfg.LogPoller)
		assert.Equal(t, logpoller.DefaultConfigSet.PollPeriod, cfg.LogPoller.PollPeriod)
		assert.Equal(t, logpoller.DefaultConfigSet.PageSize, cfg.LogPoller.PageSize)
		assert.Equal(t, logpoller.DefaultConfigSet.LogPollerStartingLookback, cfg.LogPoller.LogPollerStartingLookback)
		assert.Equal(t, logpoller.DefaultConfigSet.BlockTime, cfg.LogPoller.BlockTime)

		assert.Equal(t, "ton-testnet", cfg.NetworkNameFull)
	})

	t.Run("partial configs get field-by-field defaults applied", func(t *testing.T) {
		// Create configs with only some fields set
		customTxm := &txm.Config{
			BroadcastChanSize: 999,
			SendRetryDelay:    config.MustNewDuration(10 * time.Second),
		}
		customLP := &logpoller.Config{
			PageSize:  777,
			BlockTime: config.MustNewDuration(3 * time.Second),
		}

		cfg := &TOMLConfig{
			NetworkName:     "mainnet",
			NetworkNameFull: "custom-name",
			Chain: Chain{
				TransactionManager: customTxm,
				LogPoller:          customLP,
			},
		}
		cfg.SetDefaults()

		// Verify custom values are preserved
		assert.Equal(t, uint(999), cfg.TransactionManager.BroadcastChanSize)
		assert.Equal(t, 10*time.Second, cfg.TransactionManager.SendRetryDelay.Duration())
		assert.Equal(t, uint32(777), cfg.LogPoller.PageSize)
		assert.Equal(t, 3*time.Second, cfg.LogPoller.BlockTime.Duration())

		// Verify missing fields got defaults
		assert.Equal(t, txm.DefaultConfigSet.ConfirmPollInterval, cfg.TransactionManager.ConfirmPollInterval)
		assert.Equal(t, txm.DefaultConfigSet.MaxSendRetryAttempts, cfg.TransactionManager.MaxSendRetryAttempts)
		assert.Equal(t, txm.DefaultConfigSet.TxExpiration, cfg.TransactionManager.TxExpiration)
		assert.Equal(t, txm.DefaultConfigSet.CleanupInterval, cfg.TransactionManager.CleanupInterval)

		assert.Equal(t, logpoller.DefaultConfigSet.PollPeriod, cfg.LogPoller.PollPeriod)
		assert.Equal(t, logpoller.DefaultConfigSet.LogPollerStartingLookback, cfg.LogPoller.LogPollerStartingLookback)

		assert.Equal(t, "custom-name", cfg.NetworkNameFull)
	})
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
