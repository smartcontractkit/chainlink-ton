package postgres

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/jmoiron/sqlx"
	"github.com/rubenv/pgtest"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
)

// SetupTestDB creates a test database with connection pooling for integration tests.
// This is a shared utility that can be used across different integration test packages.
//
// Currently uses pgtest for embedded PostgreSQL instances, but can be easily replaced
// with real database connections for more comprehensive integration testing:
func SetupTestDB(t *testing.T) (sqlutil.DataSource, func()) {
	pg, err := pgtest.Start()
	require.NoError(t, err)

	// create connection
	db := sqlx.NewDb(pg.DB, "postgres")
	// wrap with DataSource
	ds := sqlutil.WrapDataSource(db, logger.Test(t))
	cleanup := func() {
		db.Close()
		err := pg.Stop() // this cleans up the content as well
		require.NoError(t, err)
	}

	return ds, cleanup
}

func ApplyMigration(ctx context.Context, ds sqlutil.DataSource, sql string) error {
	_, err := ds.ExecContext(ctx, sql)
	if err != nil {
		return fmt.Errorf("failed to create tables: %w", err)
	}
	return nil
}
