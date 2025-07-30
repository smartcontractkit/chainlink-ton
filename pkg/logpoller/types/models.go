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
	// ID is a unique identifier for the filter.
	ID int64
	
	// Name is a human-readable name for the filter, used for identification purposes.
	Name string
	
	// Address specifies the target address for which logs are being filtered.
	Address address.Address
	
	// EventName is the name of the event to filter logs for.
	EventName string
	
	// EventTopic is a topic identifier for the event log. It is used to match specific
	// events within the logs emitted by the target address.
	EventTopic uint32
	
	// StartingSeqNo defines the starting sequence number for log polling. This is
	// used to resume log filtering from a specific point in the event stream.
	StartingSeqNo uint32
	
	// Retention specifies the duration for which the logs should be retained.
	// Logs older than this duration may be purged to save storage.
	Retention time.Duration
	
	// TODO: add more fields for production (IsDeleted, IsBackfilled, MaxLogsKept, etc.)
}

// TODO: do we want to store the workchain and its seqno to be able to query the block directly?
type Log struct {
	ID       int64
	FilterID int64
	// SeqNo      uint32 // currently ListTransactions does not return seqno, need to update with block polling
	Address    address.Address
	TxHash     []byte // Transaction hash for uniqueness
	TxLT       uint64 // definitive LT
	Topic      uint32
	Data       []byte // raw BOC of the body cell
	CreatedAt  time.Time
	ReceivedAt time.Time
	ExpiresAt  *time.Time
	Error      *string
	// TODO: Add SeqNo when we have block information available
	// TODO: add fields for replay and debugging (BlockHash, BlockNumber, BlockTimestamp, TxHash, etc.)
}

// TODO: define block, transaction, and other data structures for easier debug and replay
// Similar to Solana's BlockData, ProgramLog, ProgramEvent, and Block types

// TODO: better name
type MsgWithCtx struct {
	TxHash []byte
	LT     uint64
	Msg    *tlb.ExternalMessageOut
}
