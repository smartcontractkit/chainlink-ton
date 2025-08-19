package testhelpers

import (
	"context"
	"fmt"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/rubenv/pgtest"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
)

// SetupTestDB creates a test database with ORM and tables
func SetupTestDB(t *testing.T) (sqlutil.DataSource, func()) {
	pg, err := pgtest.Start()
	require.NoError(t, err)

	// create connection
	db := sqlx.NewDb(pg.DB, "postgres")
	// wrap with DataSource
	ds := sqlutil.WrapDataSource(db, logger.Test(t))
	cleanup := func() {
		db.Close()
		err := pg.Stop()
		require.NoError(t, err)
	}

	return ds, cleanup
}

// createTables creates all necessary database tables for testing
func CreateTables(ctx context.Context, ds sqlutil.DataSource) error {
	createSchema := `
		CREATE SCHEMA ton;
	`
	_, err := ds.ExecContext(ctx, createSchema)
	if err != nil {
		return fmt.Errorf("failed to create ton schema: %w", err)
	}

	if err := createFiltersTable(ctx, ds); err != nil {
		return fmt.Errorf("failed to create filters table: %w", err)
	}

	if err := createLogsTable(ctx, ds); err != nil {
		return fmt.Errorf("failed to create logs table: %w", err)
	}

	return nil
}

// createFiltersTable creates the filters table
func createFiltersTable(ctx context.Context, ds sqlutil.DataSource) error {
	query := `
		CREATE TABLE IF NOT EXISTS ton.log_poller_filters (
			id BIGSERIAL PRIMARY KEY,
			chain_id TEXT NOT NULL,
			name VARCHAR(255) NOT NULL,
			address TEXT NOT NULL, -- user-friendly TON address *address.Address.String()
			msg_type VARCHAR(20) NOT NULL,
			event_sig BIGINT NOT NULL,
			starting_seq_no BIGINT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
			-- is_deleted BOOLEAN NOT NULL DEFAULT FALSE

    	CONSTRAINT check_msg_type CHECK (msg_type IN ('INTERNAL', 'EXTERNAL_IN', 'EXTERNAL_OUT'))
		);

		CREATE UNIQUE INDEX IF NOT EXISTS ton_log_poller_filter_name ON ton.log_poller_filters (chain_id, name); -- WHERE NOT is_deleted;
		CREATE INDEX IF NOT EXISTS idx_filters_address_msgtype ON ton.log_poller_filters(address, msg_type);
	`

	_, err := ds.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create filters table: %w", err)
	}

	return nil
}

// createLogsTable creates the logs table
func createLogsTable(ctx context.Context, ds sqlutil.DataSource) error {
	query := `
		CREATE TABLE IF NOT EXISTS ton.log_poller_logs (
			id BIGSERIAL PRIMARY KEY,
			filter_id BIGINT NOT NULL,
			chain_id TEXT NOT NULL,
			address TEXT NOT NULL, -- user-friendly TON address
			event_sig BIGINT NOT NULL,
			data BYTEA, -- BOC-encoded cell data
			tx_hash BYTEA NOT NULL,
			tx_lt BIGINT NOT NULL,
			tx_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
			block_workchain INT NOT NULL,
			block_shard BIGINT NOT NULL,
			block_seqno BIGINT NOT NULL,
			master_block_seqno BIGINT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

			CONSTRAINT fk_logs_filter FOREIGN KEY (filter_id) REFERENCES ton.log_poller_filters(id) ON DELETE CASCADE
		);

		-- Unique constraint to prevent duplicate log entries
		CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_unique ON ton.log_poller_logs (tx_hash, event_sig);
		
		-- Index for common query patterns
		CREATE INDEX IF NOT EXISTS idx_logs_address_event ON ton.log_poller_logs(address, event_sig);
		CREATE INDEX IF NOT EXISTS idx_logs_tx_lt ON ton.log_poller_logs(tx_lt);
	`

	_, err := ds.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create logs table: %w", err)
	}

	return nil
}
