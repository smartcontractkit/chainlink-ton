package types

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

type TxHash [32]byte

// BlockRange represents a range of blocks to process
type BlockRange struct {
	Prev *ton.BlockIDExt // previous block (nil for genesis)
	To   *ton.BlockIDExt // target block to process up to
}

// internal types for processing
type IndexedTx struct {
	Tx *tlb.Transaction
	// TODO(NONEVM-2194): store block metadata
	// ShardBlock     *ton.BlockIDExt
	// MasterBlock    *ton.BlockIDExt
	// BlockTimestamp time.Time
}

type IndexedMsg struct {
	IndexedTx
	Msg *tlb.ExternalMessageOut
}

// internal types for processing, DB schema should be separated
type Filter struct {
	ID            int64            // ID is a unique identifier for the filter.
	Name          string           // Name is a human-readable name for the filter, used for identification purposes.
	Address       *address.Address // specifies the source address for which logs are being filtered.
	EventName     string           // EventName is the name of the event to filter logs for.
	EventSig      uint32           // EventSig is a topic identifier for the event log.
	StartingSeqNo uint32           // StartingSeqNo defines the starting sequence number for log polling.
	Retention     time.Duration    // Retention specifies the duration for which the logs should be retained.
}

type Log struct {
	ID                  int64            // Unique identifier for the log entry.
	FilterID            int64            // Identifier of the filter that matched this log.
	ChainID             string           // ChainID of the blockchain where the log was generated.
	Address             *address.Address // Source contract address associated with the log entry.
	EventSig            uint32           // Topic identifier for categorizing the log entry.
	Data                *cell.Cell       // Event msg body containing the log data.
	TxHash              TxHash           // Transaction hash for uniqueness within the blockchain.
	TxLT                uint64           // Logical time (LT) of the transaction, used for ordering and uniqueness.
	TxTimestamp         time.Time        // Timestamp of the transaction that generated the log.
	ShardBlockWorkchain int32            // Shard block metadata - workchain
	ShardBlockShard     int64            // Shard block metadata - shard ID
	ShardBlockSeqno     uint32           // Shard block metadata - sequence number
	MasterBlockSeqno    uint32           // Masterchain block sequence number
}

func (l Log) String() string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("  Filter ID:    %d\n", l.FilterID))
	sb.WriteString(fmt.Sprintf("  Address:      %s\n", l.Address))
	sb.WriteString(fmt.Sprintf("  Tx Hash:      %s\n", hex.EncodeToString(l.TxHash[:])))
	sb.WriteString(fmt.Sprintf("  Tx LT:        %d\n", l.TxLT))
	sb.WriteString(fmt.Sprintf("  Tx Timestamp: %s\n", l.TxTimestamp.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("  Event Topic:  %d\n", l.EventSig))
	if l.Data != nil {
		sb.WriteString(fmt.Sprintf("  Data (BOC):   %s\n", hex.EncodeToString(l.Data.ToBOC())))
	} else {
		sb.WriteString("  Data (BOC):   <nil>\n")
	}
	sb.WriteString(fmt.Sprintf("  Shard Block:  (Workchain: %d, Shard: %d, Seqno: %d)\n", l.ShardBlockWorkchain, l.ShardBlockShard, l.ShardBlockSeqno))
	sb.WriteString(fmt.Sprintf("  Master Block: (Seqno: %d)\n", l.MasterBlockSeqno))
	sb.WriteString(fmt.Sprintf("  Chain ID:     %s\n", l.ChainID))

	return sb.String()
}
