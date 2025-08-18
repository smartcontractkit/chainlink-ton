package orm

import (
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
)

// DSORM provides database operations for the TON log poller
type DSORM struct {
	chainID string
	lggr    logger.SugaredLogger
	ds      sqlutil.DataSource
}

// NewORM creates a new ORM instance
func NewORM(chainID string, ds sqlutil.DataSource, lggr logger.Logger) *DSORM {
	return &DSORM{
		chainID: chainID,
		lggr:    logger.Sugared(lggr),
		ds:      ds,
	}
}
