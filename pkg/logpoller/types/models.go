package types

import (
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

// TON CCIP MVP Types
//
// This package contains minimal type definitions for TON CCIP MVP implementation.
// These types will be expanded with additional fields for replay functionality,
// easier debugging, block data, and other production features as needed.

type Filter struct {
	ID            int64         // ID is a unique identifier for the filter.
	Name          string        // Name is a human-readable name for the filter, used for identification purposes.
	Address       Address       // Address specifies the target address for which logs are being filtered.
	EventName     string        // EventName is the name of the event to filter logs for.
	EventTopic    uint32        // EventTopic is a topic identifier for the event log.
	StartingSeqNo uint32        // StartingSeqNo defines the starting sequence number for log polling.
	Retention     time.Duration // Retention specifies the duration for which the logs should be retained.
	// TODO: add more fields for production (IsDeleted, IsBackfilled, MaxLogsKept, etc.)
}

type Log struct {
	ID       int64 // Unique identifier for the log entry.
	FilterID int64 // Identifier of the filter that matched this log.

	ChainID string  // ChainID of the blockchain where the log was generated.
	Address Address // Source contract address associated with the log entry.

	EventTopic uint32 // Topic identifier for categorizing the log entry.
	Data       []byte // Raw BOC (Bag of Cells) of the body cell containing the log data(message body).

	TxHash      []byte    // Transaction hash for uniqueness within the blockchain.
	TxLT        uint64    // Logical time (LT) of the transaction, used for ordering and uniqueness.
	TxTimestamp time.Time // Timestamp of the transaction that generated the log.

	ShardBlockWorkchain int32 // Shard block metadata
	ShardBlockShard     int64
	ShardBlockSeqno     uint32

	MasterBlockSeqno uint32 // Master block sequence number

	CreatedAt time.Time  // Timestamp when the log entry was created.
	ExpiresAt *time.Time // Optional expiration timestamp for the log entry.

	Error *string // Optional error message associated with the log entry.
}

func (l Log) String() string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("Log ID: %d\n", l.ID))
	sb.WriteString(fmt.Sprintf("  Filter ID:    %d\n", l.FilterID))
	sb.WriteString(fmt.Sprintf("  Address:      %s\n", l.Address))
	sb.WriteString(fmt.Sprintf("  Tx Hash:      %s\n", hex.EncodeToString(l.TxHash)))
	sb.WriteString(fmt.Sprintf("  Tx LT:        %d\n", l.TxLT))
	sb.WriteString(fmt.Sprintf("  Tx Timestamp: %s\n", l.TxTimestamp.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("  Event Topic:  %d\n", l.EventTopic))
	sb.WriteString(fmt.Sprintf("  Data (BOC):   %s\n", hex.EncodeToString(l.Data)))
	sb.WriteString(fmt.Sprintf("  Created At:   %s\n", l.CreatedAt.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("  Shard Block:  (Workchain: %d, Shard: %d, Seqno: %d)\n", l.ShardBlockWorkchain, l.ShardBlockShard, l.ShardBlockSeqno))
	sb.WriteString(fmt.Sprintf("  Master Block: (Seqno: %d)\n", l.MasterBlockSeqno))
	sb.WriteString(fmt.Sprintf("  Chain ID:     %s\n", l.ChainID))

	return sb.String()
}

type TxWithBlockInfo struct {
	Tx             *tlb.Transaction
	ShardBlock     *ton.BlockIDExt
	MasterBlock    *ton.BlockIDExt
	BlockTimestamp time.Time
}

type ExternalMsgWithBlockInfo struct {
	TxWithBlockInfo
	Msg *tlb.ExternalMessageOut
}
