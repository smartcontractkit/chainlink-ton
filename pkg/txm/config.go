package txm

import (
	"time"
)

type Config struct {
	BroadcastChanSize        uint          // Size of the broadcast queue
	ConfirmPollSecs          uint          // Interval to poll for transaction confirmations
	SendRetryDelay           time.Duration // Delay between send retry attempts
	MaxSendRetryAttempts     uint          // Max retries before giving up broadcasting
	TxExpirationMins         uint          // Time (in minutes) after which an unconfirmed transaction is considered expired
	StickyNodeContextEnabled bool          // Whether to use sticky context (single node per lifecycle)
}

var DefaultConfigSet = Config{
	BroadcastChanSize:        100,
	ConfirmPollSecs:          5,
	SendRetryDelay:           3 * time.Second,
	MaxSendRetryAttempts:     5,
	TxExpirationMins:         5,
	StickyNodeContextEnabled: true,
}
