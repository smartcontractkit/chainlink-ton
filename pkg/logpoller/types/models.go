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
	ID            int64
	Name          string
	Address       address.Address
	EventName     string
	EventTopic    uint32 // topic identifier of a event log
	StartingSeqNo uint32 // set starting seqno when registering the filter
	Retention     time.Duration
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
