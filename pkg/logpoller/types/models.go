package types

import (
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

// TON CCIP MVP Types
//
// This package contains minimal type definitions for TON CCIP MVP implementation.
// These types will be expanded with additional fields for replay functionality,
// easier debugging, block data, and other production features as needed.
//
// Current implementation focuses on core log polling and filtering capabilities.
// Future enhancements will include more comprehensive block and transaction data
// similar to the Solana implementation pattern.

type Filter struct {
	ID            int64            // ID is a unique identifier for the filter.
	Name          string           // Name is a human-readable name for the filter, used for identification purposes.
	Address       *address.Address // Address specifies the target address for which logs are being filtered.
	EventName     string           // EventName is the name of the event to filter logs for.
	EventTopic    uint32           // EventTopic is a topic identifier for the event log.
	StartingSeqNo uint32           // StartingSeqNo defines the starting sequence number for log polling.
	Retention     time.Duration    // Retention specifies the duration for which the logs should be retained.
	// TODO: add more fields for production (IsDeleted, IsBackfilled, MaxLogsKept, etc.)
}

// TODO: do we want to store the workchain and its seqno to be able to query the block directly?
type Log struct {
	ID         int64            // Unique identifier for the log entry.
	FilterID   int64            // Identifier of the filter that matched this log.
	ChainID    string           // ChainID of the blockchain where the log was generated.
	Address    *address.Address // Address associated with the log entry.
	TxHash     []byte           // Transaction hash for uniqueness within the blockchain.
	TxLT       uint64           // Logical time (LT) of the transaction, used for ordering and uniqueness.
	EventTopic uint32           // Topic identifier for categorizing the log entry.
	Data       []byte           // Raw BOC (Bag of Cells) of the body cell containing the log data.
	CreatedAt  time.Time        // Timestamp when the log entry was created.
	ExpiresAt  *time.Time       // Optional expiration timestamp for the log entry.
	Error      *string          // Optional error message associated with the log entry.
	// TODO: add masterchain block metadata, probably only seqNo, when we have block information available
	// TODO: add workchain block metadata, use ton.*BlockIDExt.***
	// BlockIDExt.Workchain int32  `tl:"int"`
	// BlockIDExt.Shard     int64  `tl:"long"`
	// BlockIDExt.SeqNo     uint32 `tl:"int"`
	// TODO: consider adding more block metadata
	// BlockHash      Hash
	// BlockNumber    int64
	// BlockTimestamp time.Time
	// TODO: consider adding msg LT(extMsgOut) for better debugging
}

// TODO: define block, transaction, and other data structures for easier debug and replay
// Similar to Solana's BlockData, ProgramLog, ProgramEvent, and Block types

// TODO: better name
type MsgWithCtx struct {
	TxHash []byte
	LT     uint64
	Msg    *tlb.ExternalMessageOut
}

// TODO: fix address
// === CONT  TestLogPollerLogs
//     orm_test.go:73:
//                 Error Trace:    /Users/jonghyeonpark/github/work/chainlink-ton/pkg/logpoller/orm_test.go:73
//                 Error:          Received unexpected error:
//                                 cannot convert {{true false} 2 0 256 [170 217 29 10 99 172 24 148 76 102 157 78 94 74 91 72 142 88 85 99 42 150 206 171 30 94 92 52 197 95 164 224]} to Bytea
//                 Test:           TestLogPollerLogs
// --- FAIL: TestLogPollerLogs (0.03s)
