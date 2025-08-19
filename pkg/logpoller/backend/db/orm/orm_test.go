package orm

import (
	"testing"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/testhelpers"
)

// SetupTestORM is a test-local helper function
func SetupTestORM(t *testing.T, chainID string) *DSORM {
	// create the generic db connection from the helper
	ds, cleanup := testhelpers.SetupTestDB(t)
	t.Cleanup(cleanup) // automatic cleanup
	// create logpoller tables(filter, log)
	testhelpers.CreateTables(t.Context(), ds)
	// create new orm instance
	testORM := NewORM(chainID, ds, logger.Test(t))

	return testORM
}
