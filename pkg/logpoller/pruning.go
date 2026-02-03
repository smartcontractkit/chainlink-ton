package logpoller

import (
	"context"
	"time"
)

// backgroundPruningRun executes a single pruning cycle.
// Called periodically by the service's GoTick ticker.
// Executes pruning in sequence: time-based -> count-based -> deleted filter cleanup.
// Continues on error - if one type fails, logs warning and continues to next.
func (lp *service) backgroundPruningRun(ctx context.Context) {
	start := time.Now()
	var totalDeleted int64

	// Time-based pruning
	deleted, err := lp.logStore.DeleteExpiredLogs(ctx, lp.pruningBatchSize)
	if err != nil {
		lp.lggr.Errorw("time-based pruning failed", "err", err)
		lp.metrics.IncrementPruningErrors(ctx)
	} else {
		totalDeleted += deleted
	}

	// Count-based pruning
	deleted, err = lp.logStore.DeleteExcessLogs(ctx, lp.pruningBatchSize)
	if err != nil {
		lp.lggr.Errorw("count-based pruning failed", "err", err)
		lp.metrics.IncrementPruningErrors(ctx)
	} else {
		totalDeleted += deleted
	}

	// Deleted filter log cleanup (logs only)
	deleted, err = lp.logStore.DeleteLogsForDeletedFilters(ctx, lp.pruningBatchSize)
	if err != nil {
		lp.lggr.Errorw("deleted filter log cleanup failed", "err", err)
		lp.metrics.IncrementPruningErrors(ctx)
	} else {
		totalDeleted += deleted
	}

	// Empty & soft-deleted filter cleanup (filter rows with no remaining logs)
	filtersDeleted, err := lp.filterStore.DeleteEmptyFilters(ctx)
	if err != nil {
		lp.lggr.Errorw("empty filter cleanup failed", "err", err)
		lp.metrics.IncrementPruningErrors(ctx)
	} else if filtersDeleted > 0 {
		lp.lggr.Debugw("deleted empty filters", "count", filtersDeleted)
	}

	duration := time.Since(start)

	lp.lggr.Debugw("pruning cycle complete",
		"totalDeleted", totalDeleted,
		"duration", duration,
	)

	lp.metrics.AddLogsDeleted(ctx, totalDeleted)
	lp.metrics.SetPruningDuration(ctx, duration)
}
