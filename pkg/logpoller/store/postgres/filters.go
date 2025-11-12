package postgres

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

var _ logpoller.FilterStore = (*filterStore)(nil)

type filterStore struct {
	chainID string
	orm     *DSORM
	lggr    logger.Logger
}

func NewFilterStore(chainID string, orm *DSORM, lggr logger.Logger) logpoller.FilterStore {
	return &filterStore{
		chainID: chainID,
		orm:     orm,
		lggr:    logger.Named(lggr, "FilterStore."+chainID),
	}
}

// RegisterFilter implements business logic for registering a filter.
// If a filter with the same name already exists (and not deleted), it updates the filter fields.
// This ensures idempotent behavior - multiple calls with same filter won't fail.
func (s *filterStore) RegisterFilter(ctx context.Context, filter models.Filter) (int64, error) {
	// convert application-level type to database-level type
	filterModel := filterModel{}
	dbF := filterModel.FromFilter(filter)
	dbF.ChainID = s.chainID

	// TODO: do we need in-memory cache index for the filters? Solana has one, but mostly for decoder

	// Use INSERT ... ON CONFLICT to handle both new and existing filters
	// This matches Solana's behavior and ensures idempotent filter registration
	query := `INSERT INTO ton.log_poller_filters (chain_id, name, address, msg_type, event_sig, starting_seq_no)
		VALUES (:chain_id, :name, :address, :msg_type, :event_sig, :starting_seq_no)
		ON CONFLICT (chain_id, name) WHERE NOT is_deleted DO UPDATE SET
			address = EXCLUDED.address,
			msg_type = EXCLUDED.msg_type,
			event_sig = EXCLUDED.event_sig,
			starting_seq_no = EXCLUDED.starting_seq_no
		RETURNING id
	`
	var id int64
	err := s.orm.NamedGetContext(ctx, &id, query, &dbF)
	if err != nil {
		s.lggr.Errorw("DB insert/update failed",
			"chainID", dbF.ChainID,
			"name", dbF.Name,
			"query", query,
			"error", err)
		return 0, err
	}

	return id, nil
}

// UnregisterFilter implements business logic for removing a filter
// Uses soft delete to preserve filter_id references in logs table (prevents FK violations)
func (s *filterStore) UnregisterFilter(ctx context.Context, name string) error {
	query := `UPDATE ton.log_poller_filters 
		SET is_deleted = true 
		WHERE chain_id = :chain_id AND name = :name
	`
	_, err := s.orm.NamedExecContext(ctx, query, map[string]any{
		"chain_id": s.chainID,
		"name":     name,
	})
	return err
}

// HasFilter checks if a filter exists
func (s *filterStore) HasFilter(ctx context.Context, name string) (bool, error) {
	query := `SELECT EXISTS(
			SELECT 1 FROM ton.log_poller_filters 
			WHERE chain_id = :chain_id AND name = :name AND is_deleted = false
		)
	`

	var exists bool
	err := s.orm.NamedGetContext(ctx, &exists, query, map[string]any{
		"chain_id": s.chainID,
		"name":     name,
	})
	if err != nil {
		return false, fmt.Errorf("failed to check filter existence: %w", err)
	}

	return exists, nil
}

// GetDistinctAddresses returns all unique contract addresses being tracked
func (s *filterStore) GetDistinctAddresses(ctx context.Context) ([]*address.Address, error) {
	query := `SELECT DISTINCT address 
		FROM ton.log_poller_filters 
		WHERE chain_id = :chain_id AND is_deleted = false
	`
	var addressBytes [][]byte
	err := s.orm.NamedSelectContext(ctx, &addressBytes, query, map[string]any{"chain_id": s.chainID})
	if err != nil {
		return nil, fmt.Errorf("failed to get distinct addresses: %w", err)
	}

	addresses := make([]*address.Address, 0, len(addressBytes))
	for _, addrBytes := range addressBytes {
		addr, err := codec.AddressBytesToTONAddress(addrBytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse address %v: %w", addrBytes, err)
		}
		addresses = append(addresses, addr)
	}

	return addresses, nil
}

// GetFiltersByAddress returns filters for a specific address and message type
func (s *filterStore) GetFiltersByAddress(ctx context.Context, addr *address.Address) ([]models.Filter, error) {
	query := `SELECT id, chain_id,name, address, msg_type, event_sig, starting_seq_no, created_at 
		FROM ton.log_poller_filters 
		WHERE chain_id = :chain_id AND address = :address AND is_deleted = false
	`
	rawAddr := codec.ToRawAddr(addr)
	var dbFilters []filterModel
	err := s.orm.NamedSelectContext(ctx, &dbFilters, query, map[string]any{
		"chain_id": s.chainID,
		"address":  rawAddr[:],
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get filters for address %s: %w", addr.String(), err)
	}

	filters := make([]models.Filter, 0, len(dbFilters))
	for _, dbF := range dbFilters {
		filter, err := dbF.ToFilter()
		if err != nil {
			return nil, fmt.Errorf("failed to convert db filter to application filter: %w", err)
		}
		filters = append(filters, filter)
	}

	return filters, nil
}
