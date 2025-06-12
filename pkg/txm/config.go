package txm

import (
	"time"
)

type TONTxmConfig struct {
	BroadcastChanSize        uint          // Size of the broadcast queue
	ConfirmPollSecs          uint          // Interval to poll for transaction confirmations
	SendRetryDelay           time.Duration // Delay between send retry attempts
	MaxSendRetryAttempts     uint          // Max retries before giving up broadcasting
	MaxConfirmationAttempts  uint          // Optional: times to check before giving up confirmation (if TTL isn't used)
	TxTTL                    time.Duration // Time after which an unconfirmed tx is considered expired
	PruneInterval            time.Duration // Interval to prune old transactions
	PruneTxExpiration        time.Duration // Age at which confirmed/failed txs should be dropped from memory
	SimulationEnabled        bool          // Whether to run simulation before broadcasting
	StickyNodeContextEnabled bool          // Whether to use sticky context (single node per lifecycle)
}

var DefaultConfigSet = TONTxmConfig{
	BroadcastChanSize:        100,
	ConfirmPollSecs:          5,
	SendRetryDelay:           3 * time.Second,
	MaxSendRetryAttempts:     5,
	MaxConfirmationAttempts:  0, // 0 means infinite attempts until TTL
	TxTTL:                    10 * time.Minute,
	PruneInterval:            4 * time.Hour,
	PruneTxExpiration:        2 * time.Hour,
	SimulationEnabled:        true,
	StickyNodeContextEnabled: true,
}
