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
	BroadcastChanSize   uint             // Size of the broadcast queue
	ConfirmPollInterval *config.Duration // Interval to poll for transaction confirmations

	// Retry implements exponential backoff with powers of 2.
	// Each attempt will wait for SendRetryDelay * 2^(attempt) capped at MaxSendRetryDelay before retrying.
	SendRetryDelay       *config.Duration // Minimum delay between send retry attempts
	MaxSendRetryDelay    *config.Duration // Maximum delay between send retry attempts
	MaxSendRetryAttempts uint             // Max retries before giving up broadcasting

	TxExpiration       *config.Duration // Time after which an unconfirmed transaction is considered expired
	CleanupInterval    *config.Duration // Interval to clean up finalized and expired transactions
	SendTimeout        *config.Duration // Timeout for each SendWaitTransaction call to prevent hanging
	TraceTimeout       *config.Duration // Timeout for each WaitForTrace call to prevent hanging
	EnableTraceLogging *bool            // Whether to gather and log full transaction traces for debugging
}

var DefaultConfigSet = Config{
	BroadcastChanSize:   100,
	ConfirmPollInterval: config.MustNewDuration(5 * time.Second),

	// Default Retry parameters account for up to ~30 seconds of wait time +/- 10% jitter.
	SendRetryDelay:       config.MustNewDuration(2 * time.Second),
	MaxSendRetryAttempts: 5,
	MaxSendRetryDelay:    config.MustNewDuration(10 * time.Second),

	TxExpiration:       config.MustNewDuration(5 * time.Minute),
	CleanupInterval:    config.MustNewDuration(60 * time.Minute),
	SendTimeout:        config.MustNewDuration(30 * time.Second),
	TraceTimeout:       config.MustNewDuration(60 * time.Second),
	EnableTraceLogging: ptr(true),
}

func ptr[T any](v T) *T {
	return &v
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
	if c.MaxSendRetryDelay == nil {
		c.MaxSendRetryDelay = DefaultConfigSet.MaxSendRetryDelay
	}
	if c.TxExpiration == nil {
		c.TxExpiration = DefaultConfigSet.TxExpiration
	}
	if c.CleanupInterval == nil {
		c.CleanupInterval = DefaultConfigSet.CleanupInterval
	}
	if c.SendTimeout == nil {
		c.SendTimeout = DefaultConfigSet.SendTimeout
	}
	if c.TraceTimeout == nil {
		c.TraceTimeout = DefaultConfigSet.TraceTimeout
	}
	if c.EnableTraceLogging == nil {
		c.EnableTraceLogging = DefaultConfigSet.EnableTraceLogging
	}
}

func (c *Config) ValidateConfig() (err error) {
	if c.BroadcastChanSize == 0 {
		err = errors.Join(err, config.ErrInvalid{Name: "BroadcastChanSize", Msg: "must be greater than 0"})
	}
	if c.ConfirmPollInterval == nil {
		err = errors.Join(err, config.ErrMissing{Name: "ConfirmPollInterval", Msg: "must be set"})
	}
	if c.SendRetryDelay == nil {
		err = errors.Join(err, config.ErrMissing{Name: "SendRetryDelay", Msg: "must be set"})
	} else if c.SendRetryDelay.IsInstant() || c.SendRetryDelay.Duration() < 0 {
		err = errors.Join(err, config.ErrInvalid{Name: "SendRetryDelay", Msg: "must be greater than 0"})
	}
	if c.MaxSendRetryAttempts == 0 {
		err = errors.Join(err, config.ErrInvalid{Name: "MaxSendRetryAttempts", Msg: "must be greater than 0"})
	}

	if c.MaxSendRetryDelay == nil {
		err = errors.Join(err, config.ErrMissing{Name: "MaxSendRetryDelay", Msg: "must be set"})
	} else if c.MaxSendRetryDelay.IsInstant() || c.MaxSendRetryDelay.Duration() < 0 {
		err = errors.Join(err, config.ErrInvalid{Name: "MaxSendRetryDelay", Msg: "must be greater than 0"})
	}

	if c.TxExpiration == nil {
		err = errors.Join(err, config.ErrMissing{Name: "TxExpiration", Msg: "must be set"})
	}
	if c.CleanupInterval == nil {
		err = errors.Join(err, config.ErrMissing{Name: "CleanupInterval", Msg: "must be set"})
	}
	if c.SendTimeout == nil {
		err = errors.Join(err, config.ErrMissing{Name: "SendTimeout", Msg: "must be set"})
	}
	if c.TraceTimeout == nil {
		err = errors.Join(err, config.ErrMissing{Name: "TraceTimeout", Msg: "must be set"})
	}
	if c.EnableTraceLogging == nil {
		err = errors.Join(err, config.ErrMissing{Name: "EnableTraceLogging", Msg: "must be set"})
	}
	return err
}
