package models

import (
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type TxHash [32]byte // transaction hash

type Tx struct {
	Transaction *tlb.Transaction // raw TON transaction from blockchain
	Block       *ton.BlockIDExt  // block metadata
}

// BlockRange represents a range of blocks to process
type BlockRange struct {
	Prev *ton.BlockIDExt // previous block (nil for genesis)
	To   *ton.BlockIDExt // target block to process up to
}

// internal types for processing
type Filter struct {
	ID            int64            // ID is a unique identifier for the filter.
	Name          string           // Name is a human-readable name for the filter, used for identification purposes.
	Address       *address.Address // specifies the source address for which logs are being filtered.
	MsgType       tlb.MsgType      // Message type to determine how to index
	EventSig      uint32           // EventSig is a identifier for the event log(topic in external out messages, opcode in internal messages).
	StartingSeqNo uint32           // StartingSeqNo defines the starting sequence number for log polling.
}

type Log struct {
	ID               int64            // Unique identifier for the log entry.
	FilterID         int64            // Identifier of the filter that matched this log.
	ChainID          string           // ChainID of the blockchain where the log was generated.
	Address          *address.Address // Source contract address associated with the log entry.
	EventSig         uint32           // EventSig is a identifier for the event log(topic in external out messages, opcode in internal messages).
	Data             *cell.Cell       // Event msg body containing the log data.
	TxHash           TxHash           // Transaction hash for uniqueness within the blockchain.
	TxLT             uint64           // Logical time (LT) of the transaction, used for ordering and uniqueness.
	TxTimestamp      time.Time        // Timestamp of the transaction that generated the log.
	Block            *ton.BlockIDExt  // Shard block metadata
	MasterBlockSeqno uint32           // Masterchain block sequence number
	MsgLT            uint64           // Message logical time for ordering
	MsgIndex         int64            // Index of the message within the transaction (0, 1, 2, ...)
	Error            error            // Optional error associated with the log entry.
}

// TypedLog represents a log entry with its parsed data.
type TypedLog[T any] struct {
	Log
	TypedData T // Parsed event data from the log's cell data(on query execution)
}

// FormatEventSig formats an event signature as a hex string for better readability in logs
func FormatEventSig(eventSig uint32) string {
	return fmt.Sprintf("0x%08x", eventSig)
}

func (l Log) String() string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("  Filter ID:    %d\n", l.FilterID))
	sb.WriteString(fmt.Sprintf("  Address:      %s\n", l.Address))
	sb.WriteString(fmt.Sprintf("  Tx Hash:      %s\n", hex.EncodeToString(l.TxHash[:])))
	sb.WriteString(fmt.Sprintf("  Tx LT:        %d\n", l.TxLT))
	sb.WriteString(fmt.Sprintf("  Tx Timestamp: %s\n", l.TxTimestamp.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("  Event Sig:    %s\n", FormatEventSig(l.EventSig)))
	if l.Data != nil {
		sb.WriteString(fmt.Sprintf("  Data (BOC):   %s\n", hex.EncodeToString(l.Data.ToBOC())))
	} else {
		sb.WriteString("  Data (BOC):   <nil>\n")
	}
	sb.WriteString(fmt.Sprintf("  Shard Block:  (Workchain: %d, Shard: %d, Seqno: %d)\n", l.Block.Workchain, l.Block.Shard, l.Block.SeqNo))
	sb.WriteString(fmt.Sprintf("  Master Block: (Seqno: %d)\n", l.MasterBlockSeqno))
	sb.WriteString(fmt.Sprintf("  Chain ID:     %s\n", l.ChainID))

	return sb.String()
}

func (l TypedLog[T]) String() string {
	var sb strings.Builder
	sb.WriteString(l.Log.String())
	sb.WriteString(fmt.Sprintf("  Typed Data:   %v\n", l.TypedData))
	return sb.String()
}

// FilterIndex maps filter keys to matching filter IDs for efficient lookup
type FilterIndex map[FilterKey][]int64

// FilterKey uniquely identifies a filter by address, message type, and event signature
type FilterKey struct {
	Address  *address.Address
	MsgType  tlb.MsgType
	EventSig uint32
}

// Equal compares two FilterKeys using Address.Equals()
func (fk FilterKey) Equal(other FilterKey) bool {
	return fk.Address.Equals(other.Address) &&
		fk.MsgType == other.MsgType &&
		fk.EventSig == other.EventSig
}
