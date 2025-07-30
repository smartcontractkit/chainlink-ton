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
	args, err := newQueryArgs(o.chainID).
		withField("name", filter.Name).
		withRetention(filter.Retention).
		withName(filter.Name).
		withAddress(filter.Address).
		withEventName(filter.EventName).
		withEventSig(filter.EventTopic).
		withStartingSeqNo(int64(filter.StartingSeqNo)).
		toArgs()
	if err != nil {
		return 0, err
	}

	query := `
    INSERT INTO ton.log_poller_filters
        (chain_id, name, address, event_name, event_sig, starting_seqno, retention)
        VALUES (:chain_id, :name, :address, :event_name, :event_sig, :starting_seqno, :retention)
    ON CONFLICT (chain_id, name) WHERE NOT is_deleted DO UPDATE SET 
                                                            event_name = EXCLUDED.event_name,
                                                            starting_seqno = EXCLUDED.starting_seqno,
                                                            retention = EXCLUDED.retention
    RETURNING id;`

	query, sqlArgs, err := o.ds.BindNamed(query, args)
	if err != nil {
		return 0, err
	}
	if err = o.ds.GetContext(ctx, &id, query, sqlArgs...); err != nil {
		return 0, err
	}
	return id, nil
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
	if err := o.validateLogs(logs); err != nil {
		return err
	}
	return o.Transact(ctx, func(orm *DSORM) error {
		return orm.insertLogsWithinTx(ctx, logs, orm.ds)
	})
}

func (o *DSORM) insertLogsWithinTx(ctx context.Context, logs []types.Log, tx sqlutil.DataSource) error {
	batchInsertSize := 4000
	for i := 0; i < len(logs); i += batchInsertSize {
		start, end := i, i+batchInsertSize
		if end > len(logs) {
			end = len(logs)
		}

		query := `INSERT INTO solana.logs
					(filter_id, chain_id, block_hash, address, tx_hash, tx_lt, event_topic, data, created_at, expires_at, error)
				VALUES
					(:filter_id, :chain_id, :block_hash, :address, :tx_hash, :tx_lt, :event_topic, :data, NOW(), :expires_at, :error)
				ON CONFLICT DO NOTHING`

		res, err := tx.NamedExecContext(ctx, query, logs[start:end])
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) && batchInsertSize > 500 {
				// In case of DB timeouts, try to insert again with a smaller batch upto a limit
				batchInsertSize /= 2
				i -= batchInsertSize // counteract +=batchInsertSize on next loop iteration
				continue
			}
			return err
		}
		numRows, err := res.RowsAffected()
		if err == nil {
			if numRows != int64(len(logs)) {
				// This probably just means we're trying to insert the same log twice, but could also be an indication
				// of other constraint violations
				o.lggr.Debugf("attempted to insert %d logs, but could only insert %d", len(logs), numRows)
			}
		}
	}
	return nil
}

func (o *DSORM) validateLogs(logs []types.Log) error {
	return nil // TODO: implement validation logic
}

// SelectLogs finds the logs in a given block range.
func (o *DSORM) SelectLogs(ctx context.Context, start, end int64, address *address.Address, eventTopic uint32) ([]types.Log, error) {
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
