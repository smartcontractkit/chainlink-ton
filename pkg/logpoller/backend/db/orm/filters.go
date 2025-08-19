package orm

import (
	"context"
	"fmt"
	"time"
)

// FilterModel represents the 'ton_log_poller_filters' table schema.
type FilterModel struct {
	ID            int64     `db:"id"`
	ChainID       string    `db:"chain_id"`
	Name          string    `db:"name"`
	Address       string    `db:"address"` // user-friendly TON address string
	MsgType       string    `db:"msg_type"`
	EventSig      uint32    `db:"event_sig"`
	StartingSeqNo uint32    `db:"starting_seq_no"`
	CreatedAt     time.Time `db:"created_at"`
}

// CreateFilter inserts a new filter into the database and returns the generated ID
func (o *DSORM) CreateFilter(ctx context.Context, filter *FilterModel) (int64, error) {
	filter.ChainID = o.chainID

	query := `
		INSERT INTO ton.log_poller_filters (
			chain_id,
			name, 
			address, 
			msg_type, 
			event_sig, 
			starting_seq_no
		)
		VALUES (
			:chain_id,
			:name, 
			:address, 
			:msg_type, 
			:event_sig, 
			:starting_seq_no
		)
		RETURNING id
	`

	stmt, err := o.ds.PrepareNamedContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to prepare named statement: %w", err)
	}
	defer stmt.Close()

	var id int64
	err = stmt.GetContext(ctx, &id, filter)
	if err != nil {
		return 0, fmt.Errorf("failed to insert filter: %w", err)
	}

	return id, nil
}

// DeleteFilterByName removes a filter by its unique name
func (o *DSORM) DeleteFilterByName(ctx context.Context, name string) error {
	query := `
		DELETE FROM ton.log_poller_filters 
		WHERE chain_id = $1 AND name = $2
	`

	result, err := o.ds.ExecContext(ctx, query, o.chainID, name)
	if err != nil {
		return fmt.Errorf("failed to delete filter %s: %w", name, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		// not an error - filter didn't exist, which is fine for idempotent delete
		o.lggr.Debugw("Filter not found for deletion", "name", name, "chainID", o.chainID)
	}

	return nil
}

// FilterExistsByName checks if a filter with the given name exists
func (o *DSORM) FilterExistsByName(ctx context.Context, name string) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM ton.log_poller_filters 
			WHERE chain_id = $1 AND name = $2
		)
	`

	var exists bool
	err := o.ds.GetContext(ctx, &exists, query, o.chainID, name)
	if err != nil {
		return false, fmt.Errorf("failed to check filter existence for %s: %w", name, err)
	}

	return exists, nil
}

// GetDistinctFilterAddresses returns a slice of unique address strings
func (o *DSORM) GetDistinctFilterAddresses(ctx context.Context) ([]string, error) {
	// TODO: check is_deleted flag
	query := `
		SELECT DISTINCT address 
		FROM ton.log_poller_filters 
		WHERE chain_id = $1
	`

	var addressStrings []string
	err := o.ds.SelectContext(ctx, &addressStrings, query, o.chainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get distinct addresses: %w", err)
	}

	return addressStrings, nil
}

// GetFiltersByAddressAndMsgType returns DbFilter records for a specific address and message type
func (o *DSORM) GetFiltersByAddressAndMsgType(ctx context.Context, address string, msgType string) ([]FilterModel, error) {
	query := `
		SELECT 
			id, 
			chain_id, 
			name, 
			address, 
			msg_type, 
			event_sig, 
			starting_seq_no, 
			created_at
		FROM ton.log_poller_filters 
		WHERE chain_id = $1 AND address = $2 AND msg_type = $3
	`

	var dbFilters []FilterModel
	err := o.ds.SelectContext(ctx, &dbFilters, query, o.chainID, address, msgType)
	if err != nil {
		return nil, fmt.Errorf("failed to get filters for address %s and message type %s: %w", address, msgType, err)
	}

	return dbFilters, nil
}
