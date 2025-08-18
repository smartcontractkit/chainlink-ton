package orm

import (
	"context"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/rubenv/pgtest"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
)

func setupTestDB(t *testing.T, chainID string) (*DSORM, func()) {
	pg, err := pgtest.Start()
	require.NoError(t, err)
	// create connection
	db := sqlx.NewDb(pg.DB, "postgres")
	// wrap with DataSource - the pg.DB is already a *sql.DB, and sqlx.DB wraps it
	ds := sqlutil.WrapDataSource(db, logger.Test(t))
	// create ORM instance
	orm := NewORM(chainID, ds, logger.Test(t))
	// create tables
	err = orm.CreateTables(context.Background())
	require.NoError(t, err)

	cleanup := func() {
		db.Close()
		err := pg.Stop()
		require.NoError(t, err)
	}

	return orm, cleanup
}
