package ocr_test

import (
	"context"
	"math/big"
	"strconv"
	"sync"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/test_logger"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/ton/balance"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	ocrbindings "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/ocr"
	relayer_utils "github.com/smartcontractkit/chainlink-ton/pkg/relay/testutils"
	tonchainpkg "github.com/smartcontractkit/chainlink-ton/pkg/ton/chain"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"

	"github.com/smartcontractkit/libocr/offchainreporting2plus/ocr3types"
	ocrtypes "github.com/smartcontractkit/libocr/offchainreporting2plus/types"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
)

func TestTransmitterLocal(t *testing.T) {
	type connection struct {
		SignedAPIClient tracetracking.SignedAPIClient
		ConnectionPool  *liteclient.ConnectionPool
	}

	type TestSetup struct {
		account connection
	}

	type testCase struct {
		name string
		test func(t *testing.T, setup TestSetup)
	}
	logger := test_logger.New()
	keystore := relayer_utils.NewTestKeystore(t)

	createAndFundAccounts := func() func(count int) []connection {
		var setupOnce sync.Once
		tonChain, err := utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
		require.NoError(t, err)
		keystore.AddKey(tonChain.Wallet.PrivateKey())
		require.NotNil(t, keystore)

		return func(count int) []connection {
			initialAmount := big.NewInt(10_000_000_000) // 10k TON
			recipients := make([]*address.Address, count)
			amounts := make([]tlb.Coins, count)
			accounts := make([]connection, count)

			for i := range count {
				w, err := tvm.NewRandomV5R1TestWallet(tonChain.Client, -217)
				require.NoError(t, err)

				// Each account gets its own independent client connection so that
				// tests (e.g. UnhealthyRPC) can close a pool without affecting others.

				pool, err := tonchainpkg.CreateLiteserverConnectionPool(t.Context(), tonChain.URL)
				require.NoError(t, err, "failed to create connection pool from URL")

				client := ton.NewAPIClient(pool, ton.ProofCheckPolicyFast).WithRetry()

				recipients[i] = w.Address()
				amounts[i] = tlb.FromNanoTON(initialAmount)

				accounts[i] = connection{
					SignedAPIClient: tracetracking.NewSignedAPIClient(client, *w),
					ConnectionPool:  pool,
				}

				keystore.AddKey(w.PrivateKey())
				require.NotNil(t, keystore)
			}

			ferr := utils.FundWallets(t, tonChain.Client, recipients, amounts)
			require.NoError(t, ferr)

			return accounts
		}
	}()

	getTransmitter := func(account tracetracking.SignedAPIClient, ocrCfg *ocr.Config) (ocr3types.ContractTransmitter[[]byte], *txm.Txm) {
		config := txm.DefaultConfigSet
		config.ConfirmPollInterval = commonconfig.MustNewDuration(2 * time.Second)

		chainID := string(chainsel.TON_LOCALNET.ChainID)

		signedClientProvider := func(ctx context.Context) (tracetracking.SignedAPIClient, error) {
			return account, nil
		}
		tonTxm, err := txm.New(logger, chainID, keystore, signedClientProvider, config)
		require.NoError(t, err)
		err = tonTxm.Start(t.Context())
		require.NoError(t, err)

		offrampAddress := account.Wallet.WalletAddress().String()

		// Stub calldata function — returns a dummy cell since we only test pre-enqueue checks
		stubCalldataFn := func(
			rawReportCtxBytes [64]byte,
			report ocr3types.ReportWithInfo[[]byte],
			signatures [][96]byte,
		) (*cell.Cell, error) {
			return cell.BeginCell().EndCell(), nil
		}

		transmitter, err := ocr.NewCCIPTransmitter(tonTxm, logger, offrampAddress, stubCalldataFn, ocrCfg)
		require.NoError(t, err)

		return transmitter, tonTxm
	}

	// buildCommitReportBOC creates a minimal commit report (price-only, no merkle roots)
	// encoded as BOC bytes, suitable for use as reportWithInfo.Report in Transmit calls.
	buildCommitReportBOC := func(t *testing.T) []byte {
		t.Helper()
		commitReport := ocrbindings.CommitReport{
			PriceUpdates: &ocrbindings.PriceUpdates{
				TokenPriceUpdates: common.SnakedCell[ocrbindings.TokenPriceUpdate]{
					{
						SourceToken: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
						UsdPerToken: big.NewInt(1000000),
					},
				},
				GasPriceUpdates: common.SnakedCell[ocrbindings.GasPriceUpdate]{
					{
						DestChainSelector:        456,
						ExecutionGasPrice:        big.NewInt(500000),
						DataAvailabilityGasPrice: big.NewInt(0),
					},
				},
			},
			MerkleRoots: common.SnakedCell[ocrbindings.MerkleRoot]{},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)
		return reportCell.ToBOC()
	}

	testCases := []testCase{
		{
			name: "BaseSetup",
			test: func(t *testing.T, setup TestSetup) {
				ocrCfg := ocr.DefaultConfigSet
				transmitter, tonTxm := getTransmitter(setup.account.SignedAPIClient, &ocrCfg)
				defer func() {
					setup.account.ConnectionPool.Stop()
					_ = tonTxm.Close()
				}()

				reportBytes := buildCommitReportBOC(t)

				err := transmitter.Transmit(
					t.Context(),
					ocrtypes.ConfigDigest{},
					1,
					ocr3types.ReportWithInfo[[]byte]{Report: reportBytes},
					nil,
				)
				require.NoError(t, err, "expected Transmit to succeed with valid setup, got error: %v", err)
			},
		},
		{
			name: "UnhealthyRPC",
			test: func(t *testing.T, setup TestSetup) {
				transmitter, tonTxm := getTransmitter(setup.account.SignedAPIClient, &ocr.DefaultConfigSet)
				defer func() {
					_ = tonTxm.Close()
				}()

				// Close RPC connection
				setup.account.ConnectionPool.Stop()

				reportBytes := buildCommitReportBOC(t)

				// Transmit after RPC is closed — should fail due to unhealthy connection
				err := transmitter.Transmit(
					t.Context(),
					ocrtypes.ConfigDigest{},
					1,
					ocr3types.ReportWithInfo[[]byte]{Report: reportBytes},
					nil,
				)
				t.Logf("Transmit error with closed RPC: %v", err)
				require.ErrorContains(t, err, "RPC error:")
			},
		},
		{
			name: "NotEnoughBalance",
			test: func(t *testing.T, setup TestSetup) {
				// Set commit cost higher than the account balance
				// so the balance check in Transmit fails.
				ocrCfg := func() ocr.Config {
					transmittersBalance, err := strconv.ParseFloat(balance.MustGet(t, setup.account.SignedAPIClient.Client, setup.account.SignedAPIClient.Wallet.WalletAddress()).String(), 64)
					require.NoError(t, err, "failed to parse transmitter balance as float64")
					transmitAmount := transmittersBalance + 1 // add 1 TON to ensure it's above the balance

					ocrCfg := ocr.DefaultConfigSet
					ocrCfg.CommitPriceUpdateOnlyCostTON = transmitAmount
					return ocrCfg
				}()
				transmitter, tonTxm := getTransmitter(setup.account.SignedAPIClient, &ocrCfg)
				defer func() {
					setup.account.ConnectionPool.Stop()
					_ = tonTxm.Close()
				}()

				reportBytes := buildCommitReportBOC(t)

				err := transmitter.Transmit(
					t.Context(),
					ocrtypes.ConfigDigest{},
					1,
					ocr3types.ReportWithInfo[[]byte]{Report: reportBytes},
					nil,
				)
				require.ErrorContains(t, err, "insufficient balance for transmission")
				t.Logf("Transmit error due to insufficient balance (expected): %v", err)
			},
		},
	}

	accounts := createAndFundAccounts(len(testCases))

	for i, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.test(t, TestSetup{
				account: accounts[i],
			})
		})
	}
}
