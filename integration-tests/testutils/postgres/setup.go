package postgres

import (
	"context"
	"testing"

	"github.com/jmoiron/sqlx"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
	"github.com/smartcontractkit/chainlink-testing-framework/lib/docker/test_env"
)

// SetupTestDB creates a test database with DataSource wrapper using chainlink-testing-framework's postgres testcontainer.
//
// This function:
// 1. Starts a PostgreSQL Docker container automatically
// 2. Creates a fresh database for the test
// 3. Returns a sqlutil.DataSource (wrapped sqlx.DB)
// 4. Auto-cleans up container and database after test completion
//
// This does NOT:
// - Run chainlink migrations
// - Start chainlink node
// - Configure blockchains
//
// You must manually create your tables after calling this function.
//
// Usage:
//
//	ds := pgtest.SetupTestDB(t)
//	err := pgtest.ApplyMigration(ctx, ds, testdata.CreateLogPollerTables)
//	require.NoError(t, err)
//
// Requirements:
//   - Docker must be running on the machine
//   - No environment variables needed
func SetupTestDB(t testing.TB) sqlutil.DataSource {
	// Create postgres testcontainer
	pg, err := test_env.NewPostgresDb(
		nil, // no docker networks needed for simple tests
		test_env.WithPostgresImageVersion("16"),
	)
	if err != nil {
		t.Fatalf("failed to create postgres testcontainer: %v", err)
	}

	// WithTestInstance requires *testing.T
	testT, ok := t.(*testing.T)
	if !ok {
		t.Fatalf("NewSqlxDB requires *testing.T, got %T", t)
	}
	pg = pg.WithTestInstance(testT)

	// Start the container
	err = pg.StartContainer()
	if err != nil {
		t.Fatalf("failed to start postgres container: %v", err)
	}

	// Note: Container cleanup is handled automatically by testcontainers' ryuk
	// No need to call Terminate() explicitly - it causes "context canceled" warnings

	// Connect to the database
	db, err := sqlx.Connect("postgres", pg.ExternalURL.String())
	if err != nil {
		t.Fatalf("failed to connect to postgres: %v", err)
	}

	t.Cleanup(func() {
		db.Close()
	})

	// Wrap with DataSource - this is what all our stores expect
	return sqlutil.WrapDataSource(db, logger.Test(t))
}

// ExecuteSQL executes the given SQL migration on the provided sqlx.DB or DataSource.
// This is a convenience helper for running CREATE TABLE and other DDL statements.
//
// Usage:
//
//	db := pgtest.SetupTestDB(t)
//	ds := sqlutil.WrapDataSource(db, logger.Test(t))
//	err := pgtest.ExecuteSQL(ctx, ds, testdata.CreateLogPollerTables)
//	require.NoError(t, err)
func ExecuteSQL(ctx context.Context, ds sqlutil.DataSource, migrationSQL string) error {
	_, err := ds.ExecContext(ctx, migrationSQL)
	return err
}
