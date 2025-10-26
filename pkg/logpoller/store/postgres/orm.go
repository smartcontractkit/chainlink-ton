package postgres

import (
	"context"
	"fmt"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
)

// DSORM provides database operations for the TON log poller
type DSORM struct {
	chainID string
	lggr    logger.Logger
	ds      sqlutil.DataSource
}

// NewORM creates a new ORM instance
func NewORM(chainID string, ds sqlutil.DataSource, lggr logger.Logger) *DSORM {
	return &DSORM{
		chainID: chainID,
		lggr:    logger.Named(lggr, "ORM."+chainID),
		ds:      ds,
	}
}

// ChainID returns the chainID for validation purposes
func (o *DSORM) ChainID() string {
	return o.chainID
}

// Transact wraps the provided function in a database transaction
func (o *DSORM) Transact(ctx context.Context, fn func(*DSORM) error) error {
	return sqlutil.Transact(ctx, func(ds sqlutil.DataSource) *DSORM {
		return &DSORM{
			chainID: o.chainID,
			lggr:    o.lggr,
			ds:      ds,
		}
	}, o.ds, nil, fn)
}

// NamedGetContext executes a named query and scans the result into dest (for single row queries)
func (o *DSORM) NamedGetContext(ctx context.Context, dest any, query string, arg any) error {
	boundQuery, sqlArgs, err := o.ds.BindNamed(query, arg)
	if err != nil {
		return fmt.Errorf("failed to bind named parameters: %w", err)
	}

	err = o.ds.GetContext(ctx, dest, boundQuery, sqlArgs...)
	if err != nil {
		return fmt.Errorf("failed to execute named get query: %w", err)
	}
	return nil
}

// NamedSelectContext executes a SELECT query with named parameters (for multiple rows)
func (o *DSORM) NamedSelectContext(ctx context.Context, dest any, query string, arg any) error {
	boundQuery, sqlArgs, err := o.ds.BindNamed(query, arg)
	if err != nil {
		return fmt.Errorf("failed to bind named parameters: %w", err)
	}

	err = o.ds.SelectContext(ctx, dest, boundQuery, sqlArgs...)
	if err != nil {
		return fmt.Errorf("failed to execute named select query: %w", err)
	}
	return nil
}

// NamedExecContext executes a named query with struct/map arguments and returns rows affected
func (o *DSORM) NamedExecContext(ctx context.Context, query string, args any) (int64, error) {
	res, err := o.ds.NamedExecContext(ctx, query, args)
	if err != nil {
		return 0, fmt.Errorf("failed to execute named query: %w", err)
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		o.lggr.Debugw("No rows affected by named query")
	}

	return rowsAffected, nil
}
