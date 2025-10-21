package logpoller

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// BuildFilterIndex creates a filter index for efficient lookup during processing.
// This function consolidates filter queries and builds an in-memory index to avoid
// repeated database calls during transaction processing.
func (lp *service) buildFilterIndex(ctx context.Context, addresses []*address.Address) (models.FilterIndex, error) {
	filterIndex := make(models.FilterIndex)
	for _, addr := range addresses {
		// Get all filters for this address
		filters, err := lp.filterStore.GetFiltersByAddress(ctx, addr)
		if err != nil {
			return nil, fmt.Errorf("failed to get filters for %s: %w", addr.String(), err)
		}

		// Index filters by (address, msgType, eventSig)
		for _, filter := range filters {
			key := models.FilterKey{
				Address:  addr,
				MsgType:  filter.MsgType,
				EventSig: filter.EventSig,
			}
			filterIndex[key] = append(filterIndex[key], filter.ID)
		}
	}

	return filterIndex, nil
}

// RegisterFilter adds a new filter to monitor specific address/event signature combinations
func (lp *service) RegisterFilter(ctx context.Context, flt models.Filter) (int64, error) {
	// Register the filter first
	id, err := lp.filterStore.RegisterFilter(ctx, flt)
	if err != nil {
		return 0, err
	}

	// TODO(2025-08-28@jadepark-dev): clean up, forcing replay for e2e now
	// Run replay in a separate goroutine to avoid blocking filter registration
	// Only replay when client and loader are available (not in barebone test setups)
	client, err := lp.clientProvider(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to get client: %w", err)
	}
	if client != nil && lp.loader != nil {
		go func() {
			replayCtx := context.Background()
			lp.lggr.Debugw("replaying logs for new filter", "filter", flt.Name, "fromBlock", flt.StartingSeqNo)
			if err := lp.Replay(replayCtx, flt.StartingSeqNo); err != nil {
				lp.lggr.Errorw("failed to replay logs for new filter", "filter", flt.Name, "error", err)
			}
		}()
	} else {
		lp.lggr.Debugw("skipping replay for new filter - client or loader not available", "filter", flt.Name)
	}

	return id, nil
}

// UnregisterFilter removes a filter by name
func (lp *service) UnregisterFilter(ctx context.Context, name string) error {
	return lp.filterStore.UnregisterFilter(ctx, name)
}

// HasFilter checks if a filter with the given name exists
func (lp *service) HasFilter(ctx context.Context, name string) (bool, error) {
	return lp.filterStore.HasFilter(ctx, name)
}
