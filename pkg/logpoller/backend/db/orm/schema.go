package orm

import (
	"context"
	"fmt"
)

// TODO: move these to test helpers, in core we'll be using migration files
// CreateTables creates all necessary database tables
func (o *DSORM) CreateTables(ctx context.Context) error {
	createSchema := `
		CREATE SCHEMA ton;
	`
	_, err := o.ds.ExecContext(ctx, createSchema)
	if err != nil {
		return fmt.Errorf("failed to create ton schema: %w", err)
	}

	return o.createFiltersTable(ctx)
}

// createFiltersTable creates the filters table
func (o *DSORM) createFiltersTable(ctx context.Context) error {
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

	_, err := o.ds.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create filters table: %w", err)
	}

	return nil
}
