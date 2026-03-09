package smoke

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
)

type erroringTxLoader struct {
	err error
}

func (l *erroringTxLoader) LoadTxsForAddress(_ context.Context, _ *models.BlockRange, _ *address.Address, _ uint32, _ chan<- models.Tx, errOut chan<- error) error {
	errOut <- l.err
	return nil
}

func (l *erroringTxLoader) GetTxsForAddress(_ context.Context, _ *models.BlockRange, _ *address.Address, _ uint32) ([]models.Tx, error) {
	return nil, l.err
}

func fastTestConfig(pollPeriod time.Duration) logpoller.Config {
	cfg := logpoller.DefaultConfigSet
	cfg.PollPeriod = config.MustNewDuration(pollPeriod)
	cfg.PruningStartDelay = config.MustNewDuration(24 * time.Hour)
	return cfg
}

// Test_LogPoller_LoaderErrorBlocksCheckpoint validates that loader errors (liteserver failures)
// block checkpoint advancement — no logs saved, lastProcessedBlockSeqNo does not advance.
func Test_LogPoller_LoaderErrorBlocksCheckpoint(t *testing.T) {
	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)
	clientProvider := func(_ context.Context) (ton.APIClientWrapped, error) {
		return tonChain.Client, nil
	}

	testAddrData := make([]byte, 32)
	testAddrData[0] = 0xDE
	testAddrData[1] = 0xAD
	testAddr := address.NewAddress(0, 0, testAddrData)

	chainID := "loader-err-chain"
	lggr := logger.Test(t)
	logStore := inmemorystore.NewLogStore(chainID, lggr)
	filterStore := inmemorystore.NewFilterStore(chainID, lggr)

	lp, err := logpoller.NewService(lggr, chainID, clientProvider, &logpoller.ServiceOptions{
		Config:      fastTestConfig(200 * time.Millisecond),
		FilterStore: filterStore,
		TxLoader:    &erroringTxLoader{err: errors.New("simulated liteserver failure")},
		LogStore:    logStore,
	})
	require.NoError(t, err)

	_, err = lp.RegisterFilter(t.Context(), models.Filter{
		Name:     "LoaderErrFilter",
		Address:  testAddr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0xDEADBEEF,
	})
	require.NoError(t, err)

	require.NoError(t, lp.Start(t.Context()))
	defer func() { require.NoError(t, lp.Close()) }()

	// Allow 3+ poll ticks
	time.Sleep(1 * time.Second)

	// No logs should be saved — loader error prevents processBlockRange from succeeding,
	// so run() returns before advancing lastProcessedBlockSeqNo.
	seqno, exists, err := logStore.GetHighestMCBlockSeqno(t.Context())
	require.NoError(t, err)
	require.False(t, exists, "no logs should be stored when loader errors occur: seqno=%d", seqno)
}
