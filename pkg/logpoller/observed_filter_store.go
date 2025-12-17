package logpoller

import (
	"context"
	"time"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	frameworkmetrics "github.com/smartcontractkit/chainlink-framework/metrics"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

var _ FilterStore = (*ObservedFilterStore)(nil)

// ObservedFilterStore wraps a FilterStore with metrics instrumentation
type ObservedFilterStore struct {
	FilterStore
	metrics *logPollerMetrics
	lggr    logger.Logger
}

// NewObservedFilterStore creates a new observed filter store wrapper
func NewObservedFilterStore(store FilterStore, metrics *logPollerMetrics, lggr logger.Logger) *ObservedFilterStore {
	return &ObservedFilterStore{
		FilterStore: store,
		metrics:     metrics,
		lggr:        logger.Named(lggr, "ObservedFilterStore"),
	}
}

// RegisterFilter wraps the underlying RegisterFilter with metrics
func (o *ObservedFilterStore) RegisterFilter(ctx context.Context, flt models.Filter) (int64, error) {
	start := time.Now()
	id, err := o.FilterStore.RegisterFilter(ctx, flt)

	o.metrics.RecordQueryDuration(ctx, "RegisterFilter", frameworkmetrics.Create, time.Since(start))

	return id, err
}

// UnregisterFilter wraps the underlying UnregisterFilter with metrics
func (o *ObservedFilterStore) UnregisterFilter(ctx context.Context, name string) error {
	start := time.Now()
	err := o.FilterStore.UnregisterFilter(ctx, name)

	o.metrics.RecordQueryDuration(ctx, "UnregisterFilter", frameworkmetrics.Del, time.Since(start))

	return err
}

// HasFilter wraps the underlying HasFilter with metrics
func (o *ObservedFilterStore) HasFilter(ctx context.Context, name string) (bool, error) {
	start := time.Now()
	exists, err := o.FilterStore.HasFilter(ctx, name)

	o.metrics.RecordQueryDuration(ctx, "HasFilter", frameworkmetrics.Read, time.Since(start))

	return exists, err
}

// GetDistinctAddresses wraps the underlying GetDistinctAddresses with metrics
func (o *ObservedFilterStore) GetDistinctAddresses(ctx context.Context) ([]*address.Address, error) {
	start := time.Now()
	addresses, err := o.FilterStore.GetDistinctAddresses(ctx)

	o.metrics.RecordQueryDuration(ctx, "GetDistinctAddresses", frameworkmetrics.Read, time.Since(start))
	if err == nil {
		o.metrics.SetAddressesMonitored(ctx, len(addresses))
	}

	return addresses, err
}

// GetFiltersByAddress wraps the underlying GetFiltersByAddress with metrics
func (o *ObservedFilterStore) GetFiltersByAddress(ctx context.Context, addr *address.Address) ([]models.Filter, error) {
	start := time.Now()
	filters, err := o.FilterStore.GetFiltersByAddress(ctx, addr)

	o.metrics.RecordQueryDuration(ctx, "GetFiltersByAddress", frameworkmetrics.Read, time.Since(start))
	if err == nil {
		o.metrics.SetQueryResultSize(ctx, "GetFiltersByAddress", len(filters))
	}

	return filters, err
}
