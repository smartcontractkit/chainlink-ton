package txm_test

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/Masterminds/semver/v3"
	chainsel "github.com/smartcontractkit/chain-selectors"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	relayer_utils "github.com/smartcontractkit/chainlink-ton/pkg/relay/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
)

// This logger prevents testing framework from printing the path and line number inside the logger package, which is not useful and clutters the logs. Instead, it will print the caller of the logger (i.e. the line in this test file where the log was called).
func testLogger() logger.Logger {
	cfg := zap.NewDevelopmentEncoderConfig()
	cfg.EncodeTime = zapcore.TimeEncoderOfLayout("15:04:05.000000000")
	core := zapcore.NewCore(
		zapcore.NewConsoleEncoder(cfg),
		zapcore.Lock(os.Stderr),
		zapcore.DebugLevel,
	)
	return logger.WithOptions(logger.NewWithCores(core), zap.AddCaller())
}

func TestTxmLocal(t *testing.T) {
	type TestSetup struct {
		debugger  debug.DebuggerEnvironment
		apiClient tracetracking.SignedAPIClient
	}

	type testCase struct {
		name string
		test func(t *testing.T, setup TestSetup)
	}
	logger := testLogger()
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

	getTxm := func(account tracetracking.SignedAPIClient) *txm.Txm {
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

		return tonTxm
	}

	testCases := []testCase{
		{
			name: "Counter contract interactions",
			test: func(t *testing.T, setup TestSetup) {
				tonTxm := getTxm(setup.apiClient)
				defer func() {
					_ = tonTxm.Close()
				}()

				const iterations int = 5
				// Deploy counter contract
				const initialValue uint32 = 0
				counterAddr := deployCounterContract(t, setup.apiClient.Wallet, initialValue)

				// Check current state
				current, err := counter.GetValue(t.Context(), setup.apiClient.Client, counterAddr)
				require.NoError(t, err)
				require.Equal(t, current, initialValue)

				// Increment multiple times
				queryID := uint64(0)
				expected := current
				for range iterations {
					incrementBody, incErr := tlb.ToCell(counter.IncreaseCount{QueryID: queryID})
					require.NoError(t, incErr)

					incErr = tonTxm.Enqueue(txm.Request{
						Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
						FromWallet:      setup.apiClient.Wallet,
						ContractAddress: *counterAddr,
						Amount:          tlb.MustFromTON("0.05"),
						Bounce:          true,
						Body:            incrementBody,
					})
					require.NoError(t, incErr)
					expected++
					queryID++

					setCountBody, incErr := tlb.ToCell(counter.SetCount{QueryID: queryID, NewCount: expected * 4})
					require.NoError(t, incErr)

					incErr = tonTxm.Enqueue(txm.Request{
						Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
						FromWallet:      setup.apiClient.Wallet,
						ContractAddress: *counterAddr,
						Amount:          tlb.MustFromTON("0.05"),
						Bounce:          true,
						Body:            setCountBody,
					})
					require.NoError(t, incErr)
					expected *= 4
					queryID++
				}

				// Wait for all txs
				waitForStableInflightCount(logger, tonTxm, 30*time.Second)

				// Check final value
				final, err := counter.GetValue(t.Context(), setup.apiClient.Client, counterAddr)
				require.NoError(t, err)
				logger.Infow("Final counter value", "value", final)
				require.Equal(t, expected, final)
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

func waitForStableInflightCount(logger logger.Logger, txm *txm.Txm, duration time.Duration) {
	const checkInterval = 200 * time.Millisecond
	stableSince := time.Now()
	stabilityReached := false

	for {
		queueLen, unconfirmedLen := txm.InflightCount()

		if queueLen == 0 && unconfirmedLen == 0 {
			if !stabilityReached {
				logger.Debugw("Inflight count stable at zero, starting timer")
				stabilityReached = true
			}
			if time.Since(stableSince) >= duration {
				logger.Debugw("Inflight count was stable for full duration", "duration", duration)
				return
			}
		} else {
			if stabilityReached {
				logger.Warnw("Inflight count was stable but changed", "queueLen", queueLen, "unconfirmedLen", unconfirmedLen, "elapsed", time.Since(stableSince))
			}
			stableSince = time.Now()
			stabilityReached = false
		}

		time.Sleep(checkInterval)
	}
}

func deployCounterContract(t *testing.T, wallet wallet.Wallet, initialValue uint32) *address.Address {
	data := counter.ContractData{
		ID:    1337,
		Value: initialValue,
		Ownable: ownable2step.Storage{
			Owner:        wallet.WalletAddress(),
			PendingOwner: address.NewAddressNone(),
		},
	}
	dataCell, err := tlb.ToCell(data)
	require.NoError(t, err)

	path := bindings.GetBuildDir("examples.Counter.compiled.json")
	code, err := wrappers.ParseCompiledContract(path)
	require.NoError(t, err)

	counterAddr, _, _, err := wallet.DeployContractWaitTransaction(t.Context(), tlb.MustFromTON("0.05"), tvm.EmptyCell, code, dataCell)
	require.NoError(t, err)

	return counterAddr
}

// TODO duplicate from "github.com/smartcontractkit/chainlink-ton/integration-tests/tracetracking/testutils/test_utils"

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
