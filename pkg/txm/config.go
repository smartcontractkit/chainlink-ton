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

	// A broadcast makes up to MaxSendRetryAttempts attempts. Before its n-th retry (n from 0), it
	// waits a random delay between SendRetryDelay and SendRetryDelay * 2^n, capped at
	// MaxSendRetryDelay.
	//
	// An attempt does not always send. While the wallet can still accept the message sent by
	// earlier attempts, the attempt sends it again. Past that, the attempt waits for the message to
	// expire and looks it up: it builds and sends a new message only if the lookup shows the old
	// one was not processed, and a failed or inconclusive lookup uses up the attempt without
	// sending. Once the attempts run out, a broadcast that sent a message waits for it to expire
	// and looks it up before giving up.
	SendRetryDelay       *config.Duration // Minimum delay between attempts
	MaxSendRetryDelay    *config.Duration // Maximum delay between attempts
	MaxSendRetryAttempts uint             // Max attempts, the first one included, before giving up broadcasting

	TxExpiration       *config.Duration // Time a transaction has to be broadcast, from when it is enqueued, and to be finalized, from when it is broadcast
	CleanupInterval    *config.Duration // Interval to clean up finalized and expired transactions
	SendTimeout        *config.Duration // Timeout for each SendWaitTransaction call to prevent hanging
	TraceTimeout       *config.Duration // Timeout for each WaitForTrace call to prevent hanging
	EnableTraceLogging *bool            // Whether to gather and log full transaction traces for debugging
}

var DefaultConfigSet = Config{
	BroadcastChanSize:   100,
	ConfirmPollInterval: config.MustNewDuration(5 * time.Second),

	// With the default retry parameters, the delays between attempts add up to at most 24s
	// (2s + 4s + 8s + 10s), not counting waits for messages to expire.
	SendRetryDelay:       config.MustNewDuration(2 * time.Second),
	MaxSendRetryAttempts: 5,
	MaxSendRetryDelay:    config.MustNewDuration(10 * time.Second),

	TxExpiration:       config.MustNewDuration(5 * time.Minute),
	CleanupInterval:    config.MustNewDuration(60 * time.Minute),
	SendTimeout:        config.MustNewDuration(30 * time.Second),
	TraceTimeout:       config.MustNewDuration(60 * time.Second),
	EnableTraceLogging: new(true),
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
