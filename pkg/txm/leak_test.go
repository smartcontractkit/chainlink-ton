package txm_test

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services/servicetest"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"
	"github.com/smartcontractkit/chainlink-common/pkg/utils/tests"

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

const stubAccountHex = "4d8e0a179e6262068f0a6fa9f7e63e3a4baa7be52c687f8ee5b9a73e02660e9a"

type stubKeystore struct{}

func (stubKeystore) Accounts(context.Context) ([]string, error) {
	return []string{stubAccountHex}, nil
}

func (stubKeystore) Sign(_ context.Context, _ string, data []byte) ([]byte, error) {
	// Return a deterministic non-empty signature; broadcastLoop never inspects it because send fails before signing.
	return make([]byte, ed25519.SignatureSize), nil
}

func (stubKeystore) Decrypt(context.Context, string, []byte) ([]byte, error) {
	return nil, errors.New("stub")
}

var _ core.Keystore = stubKeystore{}

// stubAPI satisfies the subset of ton.APIClientWrapped used by Txm.Enqueue and the wallet boilerplate.
type stubAPI struct {
	ton.APIClientWrapped
}

func (stubAPI) CurrentMasterchainInfo(context.Context) (*ton.BlockIDExt, error) {
	return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 1, Shard: 1}, nil
}

func (stubAPI) GetAccount(context.Context, *ton.BlockIDExt, *address.Address) (*tlb.Account, error) {
	// Active account with zero balance so Enqueue exercises real preflight logic and then bails on insufficient balance,
	// avoiding any actual broadcast over the (unmocked) liteserver path.
	return &tlb.Account{
		IsActive: true,
		State: &tlb.AccountState{
			AccountStorage: tlb.AccountStorage{
				Balance: tlb.FromNanoTON(big.NewInt(0)),
			},
		},
	}, nil
}

// TestTxmLeak runs the real Txm Start/Close path (broadcast, confirm, cleanup loops) under goleak,
// and exercises Enqueue() so the public service surface runs real code beyond Start/Close.
func TestTxmLeak(t *testing.T) {
	tests.VerifyNoLeaks(t)

	cfg := txm.DefaultConfigSet
	cfg.ConfirmPollInterval = commonconfig.MustNewDuration(50 * time.Millisecond)
	cfg.CleanupInterval = commonconfig.MustNewDuration(400 * time.Millisecond)
	off := false
	cfg.EnableTraceLogging = &off
	cfg.ApplyDefaults()
	require.NoError(t, cfg.ValidateConfig())

	confirmPoll := cfg.ConfirmPollInterval.Duration()

	api := stubAPI{}
	ks := stubKeystore{}

	signedClient, err := newSignedClient(api, ks)
	require.NoError(t, err)
	clientProvider := func(context.Context) (tracetracking.SignedAPIClient, error) {
		return signedClient, nil
	}

	x, err := txm.New(logger.Test(t), "leak-txm", ks, clientProvider, cfg)
	require.NoError(t, err)

	servicetest.RunHealthy(t, x)

	// Exercise the public Enqueue path so loops run against real preflight (clientProvider, masterchain info,
	// account lookup, balance comparison). The mock account is active with zero balance, so Enqueue should
	// reject with an insufficient-balance error and never push onto broadcastChan.
	err = x.Enqueue(txm.Request{
		Mode:            uint8(0),
		FromWallet:      signedClient.Wallet,
		ContractAddress: *address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
		Amount:          tlb.MustFromTON("1.0"),
		Bounce:          false,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "insufficient balance")

	// confirmLoop ticks on ConfirmPollInterval; wait several intervals so it runs before test cleanup closes the service.
	time.Sleep(6 * confirmPoll)
}

func newSignedClient(api ton.APIClientWrapped, ks core.Keystore) (tracetracking.SignedAPIClient, error) {
	pubBytes, err := hex.DecodeString(stubAccountHex)
	if err != nil {
		return tracetracking.SignedAPIClient{}, fmt.Errorf("decode stub public key: %w", err)
	}
	if len(pubBytes) != ed25519.PublicKeySize {
		return tracetracking.SignedAPIClient{}, fmt.Errorf("stub public key: expected %d bytes, got %d", ed25519.PublicKeySize, len(pubBytes))
	}
	signer := func(ctx context.Context, toSign *cell.Cell, _ uint32) ([]byte, error) {
		return ks.Sign(ctx, stubAccountHex, toSign.Hash())
	}
	w, err := wallet.FromSigner(api, pubBytes, tonconfig.WalletVersion, signer)
	if err != nil {
		return tracetracking.SignedAPIClient{}, err
	}
	return tracetracking.NewSignedAPIClient(api, *w), nil
}
