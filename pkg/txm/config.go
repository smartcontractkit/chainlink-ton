package txm

import (
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

type Config struct {
	BroadcastChanSize        uint             // Size of the broadcast queue
	ConfirmPollSecs          uint             // Interval to poll for transaction confirmations
	SendRetryDelay           *config.Duration // Delay between send retry attempts
	MaxSendRetryAttempts     uint             // Max retries before giving up broadcasting
	TxExpirationMins         uint             // Time (in minutes) after which an unconfirmed transaction is considered expired
	CleanupIntervalMins      uint             // Interval (in minutes) to clean up finalized and expired transactions
	StickyNodeContextEnabled bool             // Whether to use sticky context (single node per lifecycle)
}

var DefaultConfigSet = Config{
	BroadcastChanSize:        100,
	ConfirmPollSecs:          5,
	SendRetryDelay:           config.MustNewDuration(3 * time.Second),
	MaxSendRetryAttempts:     5,
	TxExpirationMins:         5,
	CleanupIntervalMins:      60,
	StickyNodeContextEnabled: true,
}
