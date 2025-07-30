package logpoller

import (
	"crypto/rand"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil/sqltest"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

func TestLogPollerFilters(t *testing.T) {
	t.Skip("TODO: implement test")
}

func TestLogPollerLogs(t *testing.T) {
	sqltest.SkipInMemory(t)
	t.Parallel()

	lggr := logger.Test(t)

	chainID := "test-chain-id" // TODO: replace with actual chain ID if needed

	dbx := sqltest.NewDB(t, sqltest.TestURL(t))

	// Create schema and tables for test
	_, err := dbx.Exec(`
		CREATE SCHEMA IF NOT EXISTS ton;
		
		CREATE TABLE IF NOT EXISTS ton.log_poller_filters (
			id BIGSERIAL PRIMARY KEY,
			chain_id TEXT NOT NULL,
			name TEXT NOT NULL,
			address BYTEA,
			event_name TEXT,
			event_sig INTEGER,
			starting_seqno BIGINT,
			retention BIGINT,
			is_deleted BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT NOW(),
			UNIQUE(chain_id, name)
		);
		
		CREATE TABLE IF NOT EXISTS ton.logs (
			id BIGSERIAL PRIMARY KEY,
			filter_id BIGINT REFERENCES ton.log_poller_filters(id),
			chain_id TEXT NOT NULL,
			block_hash BYTEA,
			address BYTEA,
			tx_hash BYTEA,
			tx_lt BIGINT,
			event_topic INTEGER,
			data BYTEA,
			created_at TIMESTAMP DEFAULT NOW(),
			expires_at TIMESTAMP,
			error TEXT
		);
	`)
	require.NoError(t, err)

	orm := NewORM(chainID, dbx, lggr)

	ctx := t.Context()
	// create filter as it's required for a log
	filterID, err := orm.InsertFilter(ctx, newRandomFilter(t))
	require.NoError(t, err)
	filterID2, err := orm.InsertFilter(ctx, newRandomFilter(t))
	require.NoError(t, err)
	log := newRandomLog(t, filterID, chainID, "My Event")
	log2 := newRandomLog(t, filterID2, chainID, "My Event")
	err = orm.InsertLogs(ctx, []types.Log{log, log2})
	require.NoError(t, err)
}

func newRandomFilter(t *testing.T) types.Filter {
	return types.Filter{
		Name:          uuid.NewString(),
		Address:       newRandomAddress(t),
		EventName:     "event",
		EventTopic:    hash.CalcCRC32("event"),
		StartingSeqNo: 1,
		Retention:     1000,
	}
}

func newRandomAddress(t *testing.T) *address.Address {
	t.Helper()
	randomData := make([]byte, 32)
	rand.Read(randomData) //nolint
	return address.NewAddress(0, 0, randomData)
}

func newRandomLog(t *testing.T, filterID int64, chainID string, eventName string) types.Log {
	t.Helper()
	log := types.Log{
		FilterID:   filterID,
		ChainID:    chainID,
		Address:    newRandomAddress(t), // TODO: can this be seralized?
		TxHash:     []byte{0x01, 0x02, 0x03, 0x04},
		TxLT:       1234567890,
		EventTopic: hash.CalcCRC32(eventName),
		Data:       []byte("TONs of fun"),
	}
	return log
}
