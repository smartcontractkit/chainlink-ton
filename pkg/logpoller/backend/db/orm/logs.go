package orm

import (
	"context"
	"fmt"
	"time"
)

// LogModel represents the 'ton.log_poller_logs' table schema.
type LogModel struct {
	ID               int64     `db:"id"`
	FilterID         int64     `db:"filter_id"`
	ChainID          string    `db:"chain_id"`
	Address          string    `db:"address"`
	EventSig         int64     `db:"event_sig"`
	Data             []byte    `db:"data"`
	TxHash           []byte    `db:"tx_hash"`
	TxLT             int64     `db:"tx_lt"`
	TxTimestamp      time.Time `db:"tx_timestamp"`
	BlockWorkchain   int       `db:"block_workchain"`
	BlockShard       int64     `db:"block_shard"`
	BlockSeqno       int64     `db:"block_seqno"`
	MasterBlockSeqno int64     `db:"master_block_seqno"`
	CreatedAt        time.Time `db:"created_at"`
}

// InsertLogs inserts multiple logs into the database using a bulk operation.
// Uses ON CONFLICT DO NOTHING for idempotency.
func (o *DSORM) InsertLogs(ctx context.Context, logs []LogModel) error {
	if len(logs) == 0 {
		return nil
	}

	query := `
		INSERT INTO ton.log_poller_logs (
			filter_id,
			chain_id,
			address,
			event_sig,
			data,
			tx_hash,
			tx_lt,
			tx_timestamp,
			block_workchain,
			block_shard,
			block_seqno,
			master_block_seqno
		) VALUES (
			:filter_id,
			:chain_id,
			:address,
			:event_sig,
			:data,
			:tx_hash,
			:tx_lt,
			:tx_timestamp,
			:block_workchain,
			:block_shard,
			:block_seqno,
			:master_block_seqno
		) ON CONFLICT (tx_hash, event_sig) DO NOTHING
	`

	_, err := o.ds.NamedExecContext(ctx, query, logs)
	if err != nil {
		return fmt.Errorf("failed to insert logs: %w", err)
	}

	return nil
}

// GetLogs retrieves logs for a given address and event signature, ordered by transaction logical time.
func (o *DSORM) GetLogs(ctx context.Context, address string, eventSig int64) ([]LogModel, error) {
	query := `
		SELECT id, filter_id, chain_id, address, event_sig, data, tx_hash, tx_lt, tx_timestamp, 
			block_workchain, block_shard, block_seqno, master_block_seqno, created_at
			
		FROM ton.log_poller_logs
		WHERE address = $1 AND event_sig = $2
		ORDER BY tx_lt ASC
	`

	var logs []LogModel
	err := o.ds.SelectContext(ctx, &logs, query, address, eventSig)
	if err != nil {
		return nil, fmt.Errorf("failed to get logs: %w", err)
	}

	return logs, nil
}
