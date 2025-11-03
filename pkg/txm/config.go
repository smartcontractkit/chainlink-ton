package txm

import (
	"errors"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

// Config holds configuration parameters for the Transaction Manager.
// NOTE: when adding new fields, please update ApplyDefaults, DefaultConfigSet, and ValidateConfig accordingly.
// Also check toml_test.go TestNewDecodedTOMLConfig() to ensure new fields are tested there.
type Config struct {
	BroadcastChanSize    uint             // Size of the broadcast queue
	ConfirmPollInterval  *config.Duration // Interval to poll for transaction confirmations
	SendRetryDelay       *config.Duration // Delay between send retry attempts
	MaxSendRetryAttempts uint             // Max retries before giving up broadcasting
	TxExpiration         *config.Duration // Time after which an unconfirmed transaction is considered expired
	CleanupInterval      *config.Duration // Interval to clean up finalized and expired transactions
}

var DefaultConfigSet = Config{
	BroadcastChanSize:    100,
	ConfirmPollInterval:  config.MustNewDuration(5 * time.Second),
	SendRetryDelay:       config.MustNewDuration(3 * time.Second),
	MaxSendRetryAttempts: 5,
	TxExpiration:         config.MustNewDuration(5 * time.Minute),
	CleanupInterval:      config.MustNewDuration(60 * time.Minute),
}

func (c *Config) ApplyDefaults() {
	if c.BroadcastChanSize == 0 {
		c.BroadcastChanSize = DefaultConfigSet.BroadcastChanSize
	}
	if c.ConfirmPollInterval == nil {
		c.ConfirmPollInterval = DefaultConfigSet.ConfirmPollInterval
	}
	if c.SendRetryDelay == nil {
		c.SendRetryDelay = DefaultConfigSet.SendRetryDelay
	}
	if c.MaxSendRetryAttempts == 0 {
		c.MaxSendRetryAttempts = DefaultConfigSet.MaxSendRetryAttempts
	}
	if c.TxExpiration == nil {
		c.TxExpiration = DefaultConfigSet.TxExpiration
	}
	if c.CleanupInterval == nil {
		c.CleanupInterval = DefaultConfigSet.CleanupInterval
	}
}

func (c *Config) ValidateConfig() (err error) {
	if c.BroadcastChanSize == 0 {
		err = errors.Join(err, config.ErrInvalid{Name: "BroadcastChanSize", Msg: "must be greater than 0"})
	}
	return err
}
