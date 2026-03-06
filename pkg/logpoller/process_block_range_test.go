package logpoller

import (
	"context"
	"encoding/binary"
	"errors"
	"sync"
	"testing"
	"time"

	lru "github.com/hashicorp/golang-lru/v2"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
)

type testTxLoader struct {
	txs []models.Tx
	err error
}

func (l *testTxLoader) LoadTxsForAddress(_ context.Context, _ *models.BlockRange, _ *address.Address, _ uint32, txOut chan<- models.Tx, errOut chan<- error) error {
	if l.err != nil {
		errOut <- l.err
		return nil
	}
	for _, tx := range l.txs {
		txOut <- tx
	}
	return nil
}

func (l *testTxLoader) GetTxsForAddress(_ context.Context, _ *models.BlockRange, _ *address.Address, _ uint32) ([]models.Tx, error) {
	return nil, errors.New("not implemented")
}

type testLogStore struct {
	mu   sync.Mutex
	logs []models.Log
}

func (s *testLogStore) SaveLogs(_ context.Context, logs []models.Log, _, _ uint32) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logs = append(s.logs, logs...)
	return int64(len(logs)), nil
}

func (s *testLogStore) QueryLogs(context.Context, *query.LogQuery) ([]models.Log, bool, string, error) {
	return nil, false, "", nil
}
func (s *testLogStore) GetHighestMCBlockSeqno(context.Context) (uint32, bool, error) {
	return 0, false, nil
}
func (s *testLogStore) DeleteExpiredLogs(context.Context, int64) (int64, error) { return 0, nil }
func (s *testLogStore) DeleteExcessLogs(context.Context, int64) (int64, error)  { return 0, nil }
func (s *testLogStore) DeleteLogsForDeletedFilters(context.Context, int64) (int64, error) {
	return 0, nil
}

func makeTestService(t *testing.T, loader TxLoader, logStore LogStore) *service {
	t.Helper()
	lggr := logger.Test(t)
	metrics, err := newMetrics("test")
	require.NoError(t, err)
	cache, err := lru.New[string, uint32](100)
	require.NoError(t, err)

	return &service{
		lggr:    logger.Sugared(lggr),
		chainID: "test",
		clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
			return &mockAPIClient{
				liteClient: &mockLiteClient{
					queryFunc: func(_ context.Context, _ tl.Serializable, resp tl.Serializable) error {
						ptr := resp.(*tl.Serializable)
						*ptr = ton.ShardBlockProof{
							MasterchainID: &ton.BlockIDExt{SeqNo: 50},
						}
						return nil
					},
				},
			}, nil
		},
		loader:                   loader,
		logStore:                 logStore,
		metrics:                  metrics,
		pageSize:                 100,
		batchInsertSize:          100,
		minBatchSize:             1,
		saveThreshold:            100,
		mcBlockCache:             cache,
		mcBlockResolveMaxRetries: 1,
		mcBlockResolveBaseDelay:  time.Millisecond,
	}
}

func makeTestFilterIndex(addr *address.Address, eventSig uint32) models.FilterIndex {
	filter := &models.Filter{
		Name: "test", Address: addr,
		MsgType: tlb.MsgTypeExternalOut, EventSig: eventSig,
	}
	key := models.FilterKey{Address: addr, MsgType: tlb.MsgTypeExternalOut, EventSig: eventSig}
	return models.FilterIndex{key.String(): {filter}}
}

func makeTestValidTx(addr *address.Address, eventSig uint32) (models.Tx, error) {
	dstData := make([]byte, 32)
	binary.BigEndian.PutUint32(dstData[28:], eventSig)
	dstAddr := address.NewAddress(0, 0, dstData)
	body := cell.BeginCell().MustStoreUInt(uint64(eventSig), 32).EndCell()

	extOut := &tlb.ExternalMessageOut{
		SrcAddr: addr, DstAddr: dstAddr,
		CreatedLT: 1000,
		CreatedAt: uint32(time.Now().Unix()), //nolint:gosec // safe
		Body:      body,
	}

	msgCell, err := tlb.ToCell(extOut)
	if err != nil {
		return models.Tx{}, err
	}

	dict := cell.NewDict(15)
	refCell := cell.BeginCell().MustStoreRef(msgCell).EndCell()
	keyCell := cell.BeginCell().MustStoreUInt(0, 15).EndCell()
	if err := dict.Set(keyCell, refCell); err != nil {
		return models.Tx{}, err
	}

	return models.Tx{
		Transaction: &tlb.Transaction{
			AccountAddr: addr.Data(),
			LT:          1000,
			Now:         uint32(time.Now().Unix()), //nolint:gosec // safe
			Hash:        make([]byte, 32),
			IO: struct {
				In  *tlb.Message      `tlb:"maybe ^"`
				Out *tlb.MessagesList `tlb:"maybe ^"`
			}{
				Out: &tlb.MessagesList{List: dict},
			},
		},
		Block: &ton.BlockIDExt{Workchain: 0, Shard: 1, SeqNo: 100},
	}, nil
}

func TestProcessBlockRange(t *testing.T) {
	t.Parallel()

	testAddr := address.NewAddress(0, 0, make([]byte, 32))
	const eventSig = uint32(0xDEADBEEF)
	filterIndex := makeTestFilterIndex(testAddr, eventSig)

	blockRange := &models.BlockRange{
		Prev: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 0},
		To:   &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 10},
	}
	addrs := []*address.Address{testAddr}

	t.Run("loader error blocks checkpoint", func(t *testing.T) {
		t.Parallel()
		svc := makeTestService(t, &testTxLoader{err: errors.New("liteserver failure")}, &testLogStore{})

		err := svc.processBlockRange(t.Context(), blockRange, addrs, filterIndex)
		require.Error(t, err)
		require.Contains(t, err.Error(), "loader error")
	})

	t.Run("parse error does not block checkpoint", func(t *testing.T) {
		t.Parallel()

		validTx, err := makeTestValidTx(testAddr, eventSig)
		require.NoError(t, err)

		logStore := &testLogStore{}
		svc := makeTestService(t, &testTxLoader{
			txs: []models.Tx{
				{Transaction: &tlb.Transaction{ // malformed: IO.Out=nil → parseTx error
					AccountAddr: testAddr.Data(), LT: 900,
					Now:  uint32(time.Now().Unix()), //nolint:gosec // safe
					Hash: make([]byte, 32),
				}, Block: &ton.BlockIDExt{Workchain: 0, Shard: 1, SeqNo: 100}},
				validTx,
			},
		}, logStore)

		err = svc.processBlockRange(t.Context(), blockRange, addrs, filterIndex)
		require.NoError(t, err, "parse errors should not block checkpoint advancement")

		logStore.mu.Lock()
		require.NotEmpty(t, logStore.logs, "valid tx log must be stored despite malformed tx")
		logStore.mu.Unlock()
	})
}
