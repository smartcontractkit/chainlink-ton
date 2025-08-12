package logpoller

import (
	"context"
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

// LogQuery provides strongly typed methods for log querying.
// It automatically handles parsing for the specified event type T.
type LogQuery[T any] struct {
	lp Service
}

// NewQuery creates a new query instance for a specific event type.
// Parsing is handled automatically based on the type T.
func NewQuery[T any](svc Service) *LogQuery[T] {
	return &LogQuery[T]{
		lp: svc,
	}
}

// WithFilter queries logs with a strongly typed filter.
// This automatically parses cells into type T using tlb.LoadFromCell.
func (q *LogQuery[T]) WithFilter(
	_ context.Context,
	address *address.Address,
	topic uint32,
	filter func(T) bool,
) ([]T, error) {
	svc, ok := q.lp.(*service)
	if !ok {
		return nil, errors.New("service must be a concrete *service type")
	}

	// get raw logs from the store
	logs, err := svc.store.GetLogs(address, topic)
	if err != nil {
		return nil, fmt.Errorf("failed to get logs from store: %w", err)
	}

	var typedRes []T
	for _, log := range logs {
		// parse the cell into type T
		var event T
		parseErr := tlb.LoadFromCell(&event, log.Data.BeginParse())
		if parseErr != nil {
			return nil, fmt.Errorf("failed to parse log cell: %w", parseErr)
		}

		// apply filter if provided
		if filter != nil && !filter(event) {
			continue
		}

		typedRes = append(typedRes, event)
	}

	return typedRes, nil
}

// All queries all logs without any filter.
// This is a convenience method for when no filtering is needed.
func (q *LogQuery[T]) All(
	ctx context.Context,
	address *address.Address,
	topic uint32,
) ([]T, error) {
	return q.WithFilter(ctx, address, topic, nil)
}
