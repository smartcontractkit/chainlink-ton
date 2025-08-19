package store

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/orm"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ logpoller.FilterStore = (*sqlFilterStore)(nil)

type sqlFilterStore struct {
	orm     *orm.DSORM
	chainID string
}

func NewSQLFilterStore(orm *orm.DSORM, chainID string) logpoller.FilterStore {
	return &sqlFilterStore{
		orm:     orm,
		chainID: chainID,
	}
}

// RegisterFilter implements business logic for registering a filter
func (s *sqlFilterStore) RegisterFilter(ctx context.Context, filter types.Filter) (int64, error) {
	// convert application-level type to database-level type
	dbF := s.convertToDbFilter(filter)

	// TODO: do we need in-memory cache index for the filters? Solana has one, but mostly for decoder

	// call the low-level ORM method
	return s.orm.CreateFilter(ctx, dbF)
}

// UnregisterFilter implements business logic for removing a filter
func (s *sqlFilterStore) UnregisterFilter(ctx context.Context, name string) error {
	return s.orm.DeleteFilterByName(ctx, name)
}

// HasFilter checks if a filter exists
func (s *sqlFilterStore) HasFilter(ctx context.Context, name string) (bool, error) {
	return s.orm.FilterExistsByName(ctx, name)
}

// GetDistinctAddresses returns all unique contract addresses being tracked
func (s *sqlFilterStore) GetDistinctAddresses(ctx context.Context) ([]*address.Address, error) {
	addressStrings, err := s.orm.GetDistinctFilterAddresses(ctx)
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

// GetFiltersForAddressAndMsgType returns filters for a specific address and message type
func (s *sqlFilterStore) GetFiltersForAddressAndMsgType(ctx context.Context, addr *address.Address, msgType tlb.MsgType) ([]types.Filter, error) {
	dbFilters, err := s.orm.GetFiltersByAddressAndMsgType(ctx, addr.String(), string(msgType))
	if err != nil {
		return nil, fmt.Errorf("failed to get filters for address %s and message type %s: %w", addr.String(), string(msgType), err)
	}

	filters := make([]types.Filter, 0, len(dbFilters))
	for _, dbF := range dbFilters {
		filter, err := s.convertFromDbFilter(dbF)
		if err != nil {
			return nil, fmt.Errorf("failed to convert db filter to application filter: %w", err)
		}
		filters = append(filters, filter)
	}

	return filters, nil
}

// convertToDbFilter converts an application Filter to a database DbFilter
func (s *sqlFilterStore) convertToDbFilter(filter types.Filter) *orm.FilterModel {
	return &orm.FilterModel{
		Name:          filter.Name,
		Address:       filter.Address.String(),
		MsgType:       string(filter.MsgType),
		EventSig:      filter.EventSig,
		StartingSeqNo: filter.StartingSeqNo,
	}
}

// convertFromDbFilter converts a DbFilter back to an application Filter
func (s *sqlFilterStore) convertFromDbFilter(dbF orm.FilterModel) (types.Filter, error) {
	addr, err := address.ParseAddr(dbF.Address)
	if err != nil {
		return types.Filter{}, fmt.Errorf("failed to parse address %s: %w", dbF.Address, err)
	}

	return types.Filter{
		ID:            dbF.ID,
		Name:          dbF.Name,
		Address:       addr,
		MsgType:       tlb.MsgType(dbF.MsgType),
		EventSig:      dbF.EventSig,
		StartingSeqNo: dbF.StartingSeqNo,
	}, nil
}
