package ocr_test

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/Masterminds/semver/v3"
	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/test_logger"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	ocrbindings "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/ocr"
	relayer_utils "github.com/smartcontractkit/chainlink-ton/pkg/relay/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"

	"github.com/smartcontractkit/libocr/offchainreporting2plus/ocr3types"
	ocrtypes "github.com/smartcontractkit/libocr/offchainreporting2plus/types"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestTransmitterLocal(t *testing.T) {
	type TestSetup struct {
		debugger  debug.DebuggerEnvironment
		apiClient tracetracking.SignedAPIClient
	}

	type testCase struct {
		name string
		test func(t *testing.T, setup TestSetup)
	}
	logger := test_logger.New()
	keystore := relayer_utils.NewTestKeystore(t)

	createAndFundAccounts := func() func(count uint) []tracetracking.SignedAPIClient {
		var setupOnce sync.Once
		tonChain, err := utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
		require.NoError(t, err)
		keystore.AddKey(tonChain.Wallet.PrivateKey())
		require.NotNil(t, keystore)

		return func(count uint) []tracetracking.SignedAPIClient {
			initialAmount := big.NewInt(10_000_000_000) // 10k TON
			recipients := make([]*address.Address, count)
			amounts := make([]tlb.Coins, count)
			accounts := make([]tracetracking.SignedAPIClient, count)

			for i := range count {
				w, err := tvm.NewRandomV5R1TestWallet(tonChain.Client, -217)
				require.NoError(t, err)

				recipients[i] = w.Address()
				amounts[i] = tlb.FromNanoTON(initialAmount)

				accounts[i] = tracetracking.NewSignedAPIClient(tonChain.Client, *w)

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
				transmitter, tonTxm := getTransmitter(setup.apiClient, &ocrCfg)
				defer func() {
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
			name: "NotEnoughBalance",
			test: func(t *testing.T, setup TestSetup) {
				// Set commit cost higher than the account balance
				// so the balance check in Transmit fails.
				ocrCfg := func() ocr.Config {
					transmittersBalance, err := strconv.ParseFloat(MustGetBalance(t, setup.apiClient).String(), 64)
					require.NoError(t, err, "failed to parse transmitter balance as float64")
					transmitAmount := transmittersBalance + 1 // add 1 TON to ensure it's above the balance

					ocrCfg := ocr.DefaultConfigSet
					ocrCfg.CommitPriceUpdateOnlyCostTON = transmitAmount
					return ocrCfg
				}()
				transmitter, tonTxm := getTransmitter(setup.apiClient, &ocrCfg)
				defer func() {
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
				require.Error(t, err)
				err, ok := errors.AsType[ocr.ErrInsuficcientBalance](err)
				require.True(t, ok, "expected error of type ErrInsuficcientBalance, got %T", err)
				t.Logf("Transmit error due to insufficient balance (expected): %v", err)
			},
		},
	}

	accounts := createAndFundAccounts(10)
	getAccount := func() tracetracking.SignedAPIClient {
		require.Greater(t, len(accounts), 0, "No pre-funded accounts available")
		acc := accounts[0]
		accounts = accounts[1:]
		return acc
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			transmitterAccount := getAccount()
			addresses := map[string]debug.TypeAndVersion{
				transmitterAccount.Wallet.WalletAddress().Bounce(true).String(): {Type: "Transmitter", Version: *semver.MustParse("1.0.0")},
			}

			tc.test(t, TestSetup{
				debugger:  debug.NewDebuggerTreeTrace(addresses),
				apiClient: transmitterAccount,
			})
		})
	}
}

func MustGetBalance(t *testing.T, apiClient tracetracking.SignedAPIClient) *tlb.Coins {
	balance, err := GetBalance(apiClient)
	require.NoError(t, err, "failed to get balance: %w", err)
	return balance
}

// returns balance of the account in nanotons
func GetBalance(apiClient tracetracking.SignedAPIClient) (*tlb.Coins, error) {
	ctx := apiClient.Client.Client().StickyContext(context.Background())
	master, err := apiClient.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	}

	// we use WaitForBlock to make sure block is ready,
	// it is optional but escapes us from liteserver block not ready errors
	res, err := apiClient.Client.WaitForBlock(master.SeqNo).GetAccount(ctx, master, apiClient.Wallet.WalletAddress())
	if err != nil {
		return nil, fmt.Errorf("get account err: %w", err)
	}
	if res.IsActive {
		return &res.State.Balance, nil
	}
	return nil, errors.New("account is not active")
}
