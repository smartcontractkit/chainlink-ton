package postgres

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

var _ logpoller.FilterStore = (*filterStore)(nil)

type filterStore struct {
	orm     *DSORM
	lggr    logger.SugaredLogger
	chainID string
}

func NewFilterStore(orm *DSORM, lggr logger.Logger, chainID string) logpoller.FilterStore {
	return &filterStore{
		orm:     orm,
		lggr:    logger.Sugared(lggr).Named(fmt.Sprintf("FilterStore.%s", chainID)),
		chainID: chainID,
	}
}

// RegisterFilter implements business logic for registering a filter
func (m *filterStore) RegisterFilter(ctx context.Context, filter models.Filter) (int64, error) {
	// convert application-level type to database-level type
	filterModel := filterModel{}
	dbF := filterModel.FromFilter(filter)
	dbF.ChainID = m.chainID

	// TODO: do we need in-memory cache index for the filters? Solana has one, but mostly for decoder

	query := `
		INSERT INTO ton.log_poller_filters (chain_id,name, address, msg_type, event_sig, starting_seq_no)
		VALUES (:chain_id,:name, :address, :msg_type, :event_sig, :starting_seq_no)
		RETURNING id
	`
	var id int64
	err := m.orm.NamedGetContext(ctx, &id, query, &dbF)
	if err != nil {
		return 0, err
	}
	return id, nil
}

// UnregisterFilter implements business logic for removing a filter
func (m *filterStore) UnregisterFilter(ctx context.Context, name string) error {
	query := `
		DELETE FROM ton.log_poller_filters 
		WHERE chain_id = :chain_id AND name = :name
	`
	_, err := m.orm.NamedExecContext(ctx, query, map[string]any{
		"chain_id": m.chainID,
		"name":     name,
	})
	return err
}

// HasFilter checks if a filter exists
func (m *filterStore) HasFilter(ctx context.Context, name string) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM ton.log_poller_filters 
			WHERE chain_id = :chain_id AND name = :name
		)
	`

	var exists bool
	err := m.orm.NamedGetContext(ctx, &exists, query, map[string]any{
		"chain_id": m.chainID,
		"name":     name,
	})
	if err != nil {
		return false, fmt.Errorf("failed to check filter existence: %w", err)
	}

	return exists, nil
}

// GetDistinctAddresses returns all unique contract addresses being tracked
func (m *filterStore) GetDistinctAddresses(ctx context.Context) ([]*address.Address, error) {
	query := `
		SELECT DISTINCT address 
		FROM ton.log_poller_filters 
		WHERE chain_id = :chain_id
	`
	var addressStrings []string
	err := m.orm.NamedSelectContext(ctx, &addressStrings, query, map[string]any{"chain_id": m.chainID})
	if err != nil {
		return nil, fmt.Errorf("failed to get distinct addresses: %w", err)
	}

	addresses := make([]*address.Address, 0, len(addressStrings))
	for _, addrStr := range addressStrings {
		addr, err := address.ParseAddr(addrStr)
		if err != nil {
			return nil, fmt.Errorf("failed to parse address %s: %w", addrStr, err)
		}
		addresses = append(addresses, addr)
	}

	return addresses, nil
}

// GetFiltersByAddress returns filters for a specific address and message type
func (m *filterStore) GetFiltersByAddress(ctx context.Context, addr *address.Address) ([]models.Filter, error) {
	query := `
		SELECT id, chain_id,name, address, msg_type, event_sig, starting_seq_no, created_at 
		FROM ton.log_poller_filters 
		WHERE chain_id = :chain_id AND address = :address
	`
	var dbFilters []filterModel
	err := m.orm.NamedSelectContext(ctx, &dbFilters, query, map[string]any{
		"chain_id": m.chainID,
		"address":  addr.String(),
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
