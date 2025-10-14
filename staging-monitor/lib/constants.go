package lib

import "time"

// Test timeouts and intervals
const (
	TestTimeout         = 10 * time.Minute
	PollInterval        = 4 * time.Second
	ProgressLogInterval = 15 * time.Second
)

// EVM configuration
const (
	EVMLogQuerySpan        uint64 = 20      // Query blocks in chunks of 20
	EVMDefaultGasLimit     int64  = 1000000 // TODO:TBD Gas limit for CCIP messages to TON
	EVMTransactionGasLimit uint64 = 500000  // Gas limit for router transactions
)

// TON configuration
const (
	TONNetworkGlobalIDTestnet int32  = -3                      // TON testnet network ID (-239 for mainnet)
	TONDefaultGasLimit        int64  = 1000000                 // Gas limit for CCIP messages from TON
	TONMessageValue           string = "0.05"                  // TON amount to send with router message
	TONClientRetries          int    = 3                       // Number of retries for TON client operations
	TONTxBatchSize            uint32 = 100                     // Number of transactions to fetch per batch
	TONPollInterval                  = 2500 * time.Millisecond // How often to poll for new TON blocks
)
