package logpoller

import (
	"context"
	"errors"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ ORM = (*DSORM)(nil)

type DSORM struct {
	chainID string
	ds      sqlutil.DataSource
	lggr    logger.Logger
}

// NewORM creates an DSORM scoped to chainID.
func NewORM(chainID string, ds sqlutil.DataSource, lggr logger.Logger) *DSORM {
	return &DSORM{
		chainID: chainID,
		ds:      ds,
		lggr:    lggr,
	}
}

func (o *DSORM) ChainID() string {
	return o.chainID
}

func (o *DSORM) Transact(ctx context.Context, fn func(*DSORM) error) (err error) {
	return sqlutil.Transact(ctx, o.new, o.ds, nil, fn)
}

// new returns a NewORM like o, but backed by ds.
func (o *DSORM) new(ds sqlutil.DataSource) *DSORM { return NewORM(o.chainID, ds, o.lggr) }

func (o *DSORM) HasFilter(ctx context.Context, name string) (bool, error) {
	return false, errors.New("Implement me")
}

func (o *DSORM) InsertFilter(ctx context.Context, filter types.Filter) (id int64, err error) {
	return 0, errors.New("Implement me")
}

// GetFilterByID returns filter by ID
func (o *DSORM) GetFilterByID(ctx context.Context, id int64) (types.Filter, error) {
	return types.Filter{}, errors.New("Implement me")
}

func (o *DSORM) MarkFilterDeleted(ctx context.Context, id int64) (err error) {
	return errors.New("Implement me")
}

func (o *DSORM) MarkFilterBackfilled(ctx context.Context, id int64) (err error) {
	return errors.New("Implement me")
}

func (o *DSORM) DeleteFilter(ctx context.Context, id int64) (err error) {
	return errors.New("Implement me")
}

func (o *DSORM) DeleteFilters(ctx context.Context, filters map[int64]types.Filter) error {
	return errors.New("Implement me")
}

func (o *DSORM) SelectFilters(ctx context.Context) ([]types.Filter, error) {
	return nil, errors.New("Implement me")
}

// InsertLogs is idempotent to support replays.
func (o *DSORM) InsertLogs(ctx context.Context, logs []types.Log) error {
	return errors.New("Implement me")
}

func (o *DSORM) insertLogsWithinTx(ctx context.Context, logs []types.Log, tx sqlutil.DataSource) error {
	return errors.New("Implement me")

}

func (o *DSORM) validateLogs(logs []types.Log) error {
	return errors.New("Implement me")
}

// SelectLogs finds the logs in a given block range.
func (o *DSORM) SelectLogs(ctx context.Context, start, end int64, address *address.Address, eventSig types.EventSignature) ([]types.Log, error) {
	return nil, errors.New("Implement me")
}

func (o *DSORM) FilteredLogs(ctx context.Context, filter []query.Expression, limitAndSort query.LimitAndSort, _ string) ([]types.Log, error) {
	return nil, errors.New("Implement me")
}

func (o *DSORM) GetLatestBlock(ctx context.Context) (int64, error) {
	return 0, errors.New("Implement me")
}

func (o *DSORM) SelectSeqNums(ctx context.Context) (map[int64]int64, error) {
	return nil, errors.New("Implement me")

}

func (o *DSORM) PruneLogsForFilter(ctx context.Context, filter types.Filter) (int64, error) {
	return 0, errors.New("Implement me")
}
