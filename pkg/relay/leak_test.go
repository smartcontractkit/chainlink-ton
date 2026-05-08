package relay

import (
	"context"
	"crypto/ed25519"
	"errors"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/monitoring/balance"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/services/servicetest"
	"github.com/smartcontractkit/chainlink-common/pkg/utils/tests"

	lp "github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	inmemory "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
	"github.com/smartcontractkit/chainlink-ton/pkg/relay/monitor"
	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

// relayLeakLite supports shard proof queries used by the log poller.
type relayLeakLite struct {
	ton.LiteClient
	queryFunc func(ctx context.Context, req, resp tl.Serializable) error
}

func (m *relayLeakLite) QueryLiteserver(ctx context.Context, req tl.Serializable, resp tl.Serializable) error {
	if m.queryFunc != nil {
		return m.queryFunc(ctx, req, resp)
	}
	return nil
}

// relayLeakAPI is a minimal ton.APIClientWrapped for log poller + balance monitor in leak tests.
type relayLeakAPI struct {
	ton.APIClientWrapped
	masterchainInfo *ton.BlockIDExt
	lite            *relayLeakLite
}

func (m *relayLeakAPI) CurrentMasterchainInfo(ctx context.Context) (*ton.BlockIDExt, error) {
	return m.masterchainInfo, nil
}

func (m *relayLeakAPI) LookupBlock(ctx context.Context, workchain int32, shard int64, seqNo uint32) (*ton.BlockIDExt, error) {
	return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: seqNo, Shard: 1}, nil
}

func (m *relayLeakAPI) GetAccount(_ context.Context, _ *ton.BlockIDExt, _ *address.Address) (*tlb.Account, error) {
	// Active with zero balance so Txm.Enqueue exercises real preflight (CurrentMasterchainInfo + GetAccount + balance check)
	// and then exits cleanly with insufficient-balance, without sending anything to broadcastChan.
	return &tlb.Account{
		IsActive: true,
		State: &tlb.AccountState{
			AccountStorage: tlb.AccountStorage{
				Balance: tlb.FromNanoTON(big.NewInt(0)),
			},
		},
	}, nil
}

func (m *relayLeakAPI) Client() ton.LiteClient {
	return m.lite
}

// leakTxLoader streams no transactions but matches the real loader API used by the poller.
type leakTxLoader struct{}

func (leakTxLoader) LoadTxsForAddress(_ context.Context, _ *models.BlockRange, _ *address.Address, _ uint32, _ chan<- models.Tx, _ chan<- error) error {
	return nil
}

func (leakTxLoader) GetTxsForAddress(_ context.Context, _ *models.BlockRange, _ *address.Address, _ uint32) ([]models.Tx, error) {
	return nil, errors.New("not implemented")
}

type leakKeystore struct {
	accountHex string
}

func (k leakKeystore) Accounts(context.Context) ([]string, error) {
	return []string{k.accountHex}, nil
}

func (leakKeystore) Sign(_ context.Context, _ string, _ []byte) ([]byte, error) {
	// Deterministic non-empty signature; nothing in this test inspects it.
	return make([]byte, ed25519.SignatureSize), nil
}

func (leakKeystore) Decrypt(context.Context, string, []byte) ([]byte, error) {
	return nil, errors.New("stub")
}

// threeLeakBundle starts and stops txm, log poller, and balance monitor like chain.go, without liteserver or Postgres.
type threeLeakBundle struct {
	services.StateMachine
	name string

	txm *txm.Txm
	lp  lp.Service
	bm  services.Service
}

func (b *threeLeakBundle) Name() string { return b.name }

func (b *threeLeakBundle) Start(ctx context.Context) error {
	return b.StartOnce(b.name, func() error {
		var ms services.MultiStart
		if err := ms.Start(ctx, b.txm); err != nil {
			return err
		}
		if err := ms.Start(ctx, b.lp); err != nil {
			return err
		}
		return ms.Start(ctx, b.bm)
	})
}

func (b *threeLeakBundle) Close() error {
	return b.StopOnce(b.name, func() error {
		return services.CloseAll(b.txm, b.lp, b.bm)
	})
}

func (b *threeLeakBundle) Ready() error {
	return errors.Join(b.StateMachine.Ready(), b.txm.Ready())
}

func (b *threeLeakBundle) HealthReport() map[string]error {
	report := map[string]error{b.Name(): b.Healthy()}
	services.CopyHealth(report, b.txm.HealthReport())
	services.CopyHealth(report, b.lp.HealthReport())
	services.CopyHealth(report, b.bm.HealthReport())
	return report
}

// TestChainSubservicesLeak runs Txm, log poller, and balance monitor together under goleak (mirrors chain start/stop wiring).
// After Start, it exercises Txm.Enqueue and LogPoller.RegisterFilter/UnregisterFilter so the public service surface runs
// real code beyond Start/Close.
func TestChainSubservicesLeak(t *testing.T) {
	tests.VerifyNoLeaks(t)

	lggr := logger.Test(t)
	chainID := "1"
	chainLeakName := "leak-ton-chain-bundle"

	// --- Txm ---
	txmCfg := txm.DefaultConfigSet
	txmCfg.ConfirmPollInterval = commonconfig.MustNewDuration(50 * time.Millisecond)
	txmCfg.CleanupInterval = commonconfig.MustNewDuration(400 * time.Millisecond)
	off := false
	txmCfg.EnableTraceLogging = &off
	txmCfg.ApplyDefaults()
	require.NoError(t, txmCfg.ValidateConfig())
	txmConfirmPoll := txmCfg.ConfirmPollInterval.Duration()
	txmCleanupTick := txmCfg.CleanupInterval.Duration()

	ks := leakKeystore{
		accountHex: "4d8e0a179e6262068f0a6fa9f7e63e3a4baa7be52c687f8ee5b9a73e02660e9a",
	}

	api := &relayLeakAPI{
		masterchainInfo: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1},
		lite: &relayLeakLite{
			queryFunc: func(_ context.Context, _ tl.Serializable, resp tl.Serializable) error {
				ptr := resp.(*tl.Serializable)
				*ptr = ton.ShardBlockProof{
					MasterchainID: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50},
				}
				return nil
			},
		},
	}

	signedClientWallet, err := newStubWallet(api, ks)
	require.NoError(t, err)
	signedClient := tracetracking.NewSignedAPIClient(api, *signedClientWallet)
	signedProvider := func(context.Context) (tracetracking.SignedAPIClient, error) {
		return signedClient, nil
	}

	txMgr, err := txm.New(lggr, chainID, ks, signedProvider, txmCfg)
	require.NoError(t, err)

	// --- Log poller ---
	lpCfg := lp.DefaultConfigSet
	lpCfg.PollPeriod = commonconfig.MustNewDuration(100 * time.Millisecond)
	lpCfg.PruningInterval = commonconfig.MustNewDuration(1 * time.Minute)
	lpCfg.PruningStartDelay = commonconfig.MustNewDuration(0)
	lpCfg.MCBlockResolveMaxRetries = 1
	lpCfg.MCBlockResolveBaseDelay = commonconfig.MustNewDuration(time.Millisecond)
	lpCfg.ApplyDefaults()
	require.NoError(t, lpCfg.ValidateConfig())
	lpPoll := lpCfg.PollPeriod.Duration()

	lpOpts := &lp.ServiceOptions{
		Config:      lpCfg,
		FilterStore: inmemory.NewFilterStore(chainID, lggr),
		TxLoader:    leakTxLoader{},
		LogStore:    inmemory.NewLogStore(chainID, lggr),
	}
	lpClient := func(context.Context) (ton.APIClientWrapped, error) { return api, nil }
	poller, err := lp.NewService(lggr, chainID, lpClient, lpOpts)
	require.NoError(t, err)

	pollAddr, perr := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, perr)
	_, err = poller.RegisterFilter(context.Background(), models.Filter{
		Name:     "leak-bundle-filter",
		Address:  pollAddr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0xdeadbeef,
	})
	require.NoError(t, err)

	// --- Balance monitor ---
	balancePollCfg := commonconfig.MustNewDuration(80 * time.Millisecond)
	balancePoll := balancePollCfg.Duration()
	bm, err := monitor.NewBalanceMonitor(monitor.BalanceMonitorOpts{
		ChainInfo: balance.ChainInfo{
			ChainFamilyName: "ton",
			ChainID:         chainID,
			NetworkName:     "TonMainnet",
			NetworkNameFull: "TonMainnet",
		},
		Config: balance.GenericBalanceConfig{
			BalancePollPeriod: *balancePollCfg,
		},
		Logger:   lggr,
		Keystore: ks,
		NewClient: func(context.Context) (ton.APIClientWrapped, error) {
			return api, nil
		},
	})
	require.NoError(t, err)

	bundle := &threeLeakBundle{
		name: chainLeakName,
		txm:  txMgr,
		lp:   poller,
		bm:   bm,
	}

	servicetest.RunHealthy(t, bundle)

	// Wait until each periodic subsystem has had time to tick (max of CleanupInterval, a few
	// log-poller / balance polls, and several txm confirm passes).
	initialWait := max(txmCleanupTick, 3*lpPoll, 3*balancePoll, 5*txmConfirmPoll)
	time.Sleep(initialWait)

	// Exercise Txm.Enqueue against real preflight; should fail with insufficient balance (account has 0 balance).
	enqErr := txMgr.Enqueue(txm.Request{
		Mode:            uint8(0),
		FromWallet:      *signedClientWallet,
		ContractAddress: *address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
		Amount:          tlb.MustFromTON("1.0"),
		Bounce:          false,
	})
	require.Error(t, enqErr)
	require.Contains(t, enqErr.Error(), "insufficient balance")

	// Exercise public LogPoller surface mid-flight.
	exists, herr := poller.HasFilter(context.Background(), "leak-bundle-filter")
	require.NoError(t, herr)
	require.True(t, exists)
	require.NoError(t, poller.UnregisterFilter(context.Background(), "leak-bundle-filter"))

	// Log poller observes filter changes on subsequent ticks.
	time.Sleep(2 * lpPoll)
}

func newStubWallet(api ton.APIClientWrapped, ks leakKeystore) (*wallet.Wallet, error) {
	pubBytes, err := monitor.DecodeHexPublicKey(ks.accountHex)
	if err != nil {
		return nil, err
	}
	signer := func(ctx context.Context, toSign *cell.Cell, subwallet uint32) ([]byte, error) {
		return ks.Sign(ctx, ks.accountHex, toSign.Hash())
	}
	return wallet.FromSigner(api, pubBytes, tonconfig.WalletVersion, signer)
}
