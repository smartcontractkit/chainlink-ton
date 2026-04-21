package lib

import "time"

// Test timeouts and intervals
const (
	TestTimeout         = 30 * time.Minute
	PollInterval        = 4 * time.Second
	ProgressLogInterval = 15 * time.Second
)

// EVM configuration
const (
	EVMLogQuerySpan        uint64 = 20          // Query blocks in chunks of 20
	EVMDefaultGasLimit     int64  = 100_000_000 // Destination gas limit (0.1 TON in nano TON) for messages sent from EVM to TON
	EVMTransactionGasLimit uint64 = 500000      // Gas limit for router transactions
)

// TON configuration
const (
	TONNetworkGlobalIDTestnet int32  = -3                      // TON testnet network ID
	TONDefaultGasLimit        int64  = 200_000                 // Destination gas limit (EVM gas units) for messages sent from TON to EVM
	TONClientRetries          int    = 3                       // Number of retries for TON client operations
	TONTxBatchSize            uint32 = 100                     // Number of transactions to fetch per batch
	TONPollInterval                  = 2500 * time.Millisecond // How often to poll for new TON blocks
)
