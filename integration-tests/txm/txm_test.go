package txm_test

import (
	"context"
	"math/big"
	"sync"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"go.uber.org/zap/zapcore"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/test_logger"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/ton/balance"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	relayer_utils "github.com/smartcontractkit/chainlink-ton/pkg/relay/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
)

const networkGlobalID int32 = -217

func TestTxmLocal(t *testing.T) {
	type connection struct {
		txmSignedAPIClient tracetracking.SignedAPIClient
		txmTestingClient   *testingAPIClientWrapped
		setupClient        tracetracking.SignedAPIClient
	}

	type TestSetup struct {
		startTXM         func(logger.Logger, ...txm.Config) *txm.Txm
		txmTestingClient *testingAPIClientWrapped
		setupClient      tracetracking.SignedAPIClient
	}

	type testCase struct {
		name string
		test func(t *testing.T, setup TestSetup)
	}
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
				txmClient := &testingAPIClientWrapped{
					APIClientWrapped: tonChain.Client,
				}
				txmWallet, err := tvm.NewRandomV5R1TestWallet(txmClient, networkGlobalID)
				require.NoError(t, err)

				setupWallet, err := tvm.NewV5R1Wallet(tonChain.Client, networkGlobalID, txmWallet.PrivateKey())
				require.NoError(t, err)

				recipients[i] = setupWallet.WalletAddress()
				amounts[i] = tlb.FromNanoTON(initialAmount)

				accounts[i] = connection{
					txmSignedAPIClient: tracetracking.NewSignedAPIClient(txmClient, *txmWallet),
					txmTestingClient:   txmClient,
					setupClient:        tracetracking.NewSignedAPIClient(tonChain.Client, *setupWallet),
				}

				keystore.AddKey(txmWallet.PrivateKey())
				require.NotNil(t, keystore)
			}

			ferr := utils.FundWallets(t, tonChain.Client, recipients, amounts)
			require.NoError(t, ferr)

			return accounts
		}
	}()

	testCases := []testCase{
		{
			name: "Counter contract interactions",
			test: func(t *testing.T, setup TestSetup) {
				lggr := test_logger.New()
				tonTxm := setup.startTXM(lggr)
				t.Cleanup(func() { require.NoError(t, tonTxm.Close(), "Fail to close TXM") })

				const iterations int = 5
				// Deploy counter contract
				const initialValue uint32 = 0
				setup.txmTestingClient.On("SendExternalMessageWaitTransaction", mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {})
				counterAddr := deployCounterContract(t, setup.setupClient.Wallet, initialValue)

				// Check current state
				current, err := counter.GetValue(t.Context(), setup.setupClient.Client, counterAddr)
				require.NoError(t, err)
				require.Equal(t, initialValue, current)

				// Increment multiple times
				queryID := uint64(0)
				expected := current
				for range iterations {
					incrementBody, incErr := tlb.ToCell(counter.IncreaseCount{QueryID: queryID})
					require.NoError(t, incErr)

					incErr = tonTxm.Enqueue(txm.Request{
						Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
						FromWallet:      setup.setupClient.Wallet,
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
						FromWallet:      setup.setupClient.Wallet,
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
				waitForStableInflightCount(lggr, tonTxm, 30*time.Second)

				// Check final value
				final, err := counter.GetValue(t.Context(), setup.setupClient.Client, counterAddr)
				require.NoError(t, err)
				lggr.Infow("Final counter value", "value", final)
				require.Equal(t, expected, final)
			}}, {
			name: "ZeroBalance",
			test: func(t *testing.T, setup TestSetup) {
				lggr := test_logger.New()
				tonTxm := setup.startTXM(lggr)
				t.Cleanup(func() { require.NoError(t, tonTxm.Close(), "Fail to close TXM") })

				// Deploy counter contract
				const initialValue uint32 = 0
				counterAddr := deployCounterContract(t, setup.setupClient.Wallet, initialValue)

				unblockSend := make(chan struct{})
				step := func() { unblockSend <- struct{}{} }
				// Assert that SendWaitTransaction is called only once, which means Txm is not retrying the transaction after the first failure
				setup.txmTestingClient.On("SendExternalMessageWaitTransaction", mock.Anything, mock.Anything, mock.Anything).
					Run(func(args mock.Arguments) {
						ext := args.Get(1).(*tlb.ExternalMessage)
						t.Logf("Mock SendWaitTransaction called with dstAddr: %s", ext.DstAddr.String())
						<-unblockSend
					}).Twice() // drain tx + tx expected to fail

				// Enqueue tx that will drain the transmitter's balance
				{
					err := tonTxm.Enqueue(txm.Request{
						Mode:            wallet.IgnoreErrors | wallet.CarryAllRemainingBalance,
						FromWallet:      setup.setupClient.Wallet,
						ContractAddress: *tvm.ZeroAddress,
						Amount:          tlb.MustFromTON("0.1"),
						Bounce:          false,
						Body:            tvm.EmptyCell,
					})
					require.NoError(t, err)
				}

				// Enqueue valid tx which should now fail due to insufficient funds
				{
					incrementBody, incErr := tlb.ToCell(counter.IncreaseCount{QueryID: 1})
					require.NoError(t, incErr)

					err := tonTxm.Enqueue(txm.Request{
						Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
						FromWallet:      setup.setupClient.Wallet,
						ContractAddress: *counterAddr,
						Amount:          tlb.MustFromTON("0.05"),
						Bounce:          true,
						Body:            incrementBody,
					})
					require.NoError(t, err)
				}

				{
					// TMP sleep 3 seconds
					time.Sleep(3 * time.Second)
					tbb := balance.MustGet(t, setup.setupClient.Client, setup.setupClient.Wallet.WalletAddress())
					require.Falsef(t, tbb.IsZero(), "Transmitter balance should not be zero before any tx, but it is %s", tbb.String())

					// Drain balance
					step()
					waitForStableInflightCount(lggr, tonTxm, 10*time.Second)
					tb := balance.MustGet(t, setup.setupClient.Client, setup.setupClient.Wallet.WalletAddress())
					require.Truef(t, tb.IsZero(), "Transmitter balance should be zero after depletion, but it is %s", tb.String())

					// Unblock SendWaitTransaction for the tx with zero balance and wait for it to process, which should result in an error and not be retried
					step()
					waitForStableInflightCount(lggr, tonTxm, 10*time.Second)

					currentValue, err := counter.GetValue(t.Context(), setup.setupClient.Client, counterAddr)
					require.NoError(t, err)
					require.Equal(t, initialValue, currentValue, "Counter should remain unchanged after tx with insufficient funds")
					setup.txmTestingClient.AssertExpectations(t)
				}
			}}, {
			name: "InsufficientBalance",
			test: func(t *testing.T, setup TestSetup) {
				// txm should log that wallet didn't output any message
				lggr, logs := test_logger.NewObserved()
				tonTxm := setup.startTXM(lggr)
				t.Cleanup(func() { require.NoError(t, tonTxm.Close(), "Fail to close TXM") })

				// Deploy counter contract
				const initialValue uint32 = 0
				counterAddr := deployCounterContract(t, setup.setupClient.Wallet, initialValue)

				unblockSend := make(chan struct{})
				step := func() { unblockSend <- struct{}{} }

				setup.txmTestingClient.On("SendExternalMessageWaitTransaction", mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
					ext := args.Get(1).(*tlb.ExternalMessage)
					t.Logf("Mock SendWaitTransaction called with dstAddr: %s", ext.DstAddr.String())
					<-unblockSend
				}).Twice()

				// Enqueue tx that will drain most of the transmitter's balance, leaving insufficient for the next tx
				{
					currentBalance := balance.MustGet(t, setup.setupClient.Client, setup.setupClient.Wallet.WalletAddress())
					drainAmount := tlb.FromNanoTON(new(big.Int).Sub(currentBalance.Nano(), tlb.MustFromTON("0.02").Nano()))

					err := tonTxm.Enqueue(txm.Request{
						Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
						FromWallet:      setup.setupClient.Wallet,
						ContractAddress: *tvm.ZeroAddress,
						Amount:          drainAmount,
						Bounce:          false,
						Body:            tvm.EmptyCell,
					})
					require.NoError(t, err)
				}

				// Enqueue tx which should be rejected by Enqueue due to insufficient funds
				{
					incrementBody, incErr := tlb.ToCell(counter.IncreaseCount{QueryID: 1})
					require.NoError(t, incErr)

					err := tonTxm.Enqueue(txm.Request{
						Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
						FromWallet:      setup.setupClient.Wallet,
						ContractAddress: *counterAddr,
						Amount:          tlb.MustFromTON("0.05"),
						Bounce:          true,
						Body:            incrementBody,
					})
					require.NoError(t, err)
				}
				{
					step()
					step()
					waitForStableInflightCount(lggr, tonTxm, 10*time.Second)

					currentValue, err := counter.GetValue(t.Context(), setup.setupClient.Client, counterAddr)
					require.NoError(t, err)
					require.Equal(t, initialValue, currentValue, "Counter should remain unchanged after tx with insufficient funds")
					setup.txmTestingClient.AssertExpectations(t)

					// TODO TXM should enabling getting TX results with error. Testing logs is not reliable. https://smartcontract-it.atlassian.net/browse/NONEVM-4956
					entries := logs.FilterMessage("transaction did not produce any outgoing messages, this may indicate that the value of the enqueued message was higher than the balance of the account").FilterLevelExact(zapcore.ErrorLevel)
					require.GreaterOrEqual(t, entries.Len(), 1, "expected TXM to log error")
				}
			}}, {
			name: "ExpiredTransaction",
			test: func(t *testing.T, setup TestSetup) {
				lggr := test_logger.New()
				// Use a very short TxExpiration so the transaction expires before broadcast
				config := txm.DefaultConfigSet
				config.ConfirmPollInterval = commonconfig.MustNewDuration(2 * time.Second)
				config.TxExpiration = commonconfig.MustNewDuration(0)

				tonTxm := setup.startTXM(lggr, config)
				t.Cleanup(func() { require.NoError(t, tonTxm.Close(), "Fail to close TXM") })

				setup.txmTestingClient.On("SendWaitTransaction", mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
					t.Fatal("Mock SendWaitTransaction called. This should not happen because the transaction should expire before it is sent.")
				}).Maybe()

				// Deploy counter contract
				const initialValue uint32 = 0
				counterAddr := deployCounterContract(t, setup.setupClient.Wallet, initialValue)

				err := tonTxm.Enqueue(txm.Request{
					Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
					FromWallet:      setup.setupClient.Wallet,
					ContractAddress: *counterAddr,
					Amount:          tlb.MustFromTON("0.05"),
					Bounce:          true,
					Body:            tvm.EmptyCell,
				})
				require.NoError(t, err)

				waitForStableInflightCount(lggr, tonTxm, 5*time.Second)
			}},
	}

	accounts := createAndFundAccounts(len(testCases))

	for i, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.test(t, TestSetup{
				setupClient:      accounts[i].setupClient,
				txmTestingClient: accounts[i].txmTestingClient,
				startTXM: func(lggr logger.Logger, config ...txm.Config) *txm.Txm {
					configToBeSet := txm.Config{
						ConfirmPollInterval: commonconfig.MustNewDuration(2 * time.Second),
					}
					if len(config) > 0 {
						configToBeSet = config[0]
						if configToBeSet.ConfirmPollInterval == nil {
							configToBeSet.ConfirmPollInterval = commonconfig.MustNewDuration(2 * time.Second)
						}
					}
					configToBeSet.ApplyDefaults()

					chainID := string(chainsel.TON_LOCALNET.ChainID)

					signedClientProvider := func(ctx context.Context) (tracetracking.SignedAPIClient, error) {
						return accounts[i].txmSignedAPIClient, nil
					}
					tonTxm, err := txm.New(lggr, chainID, keystore, signedClientProvider, configToBeSet)
					require.NoError(t, err)
					err = tonTxm.Start(t.Context())
					require.NoError(t, err)

					return tonTxm
				},
			})
		})
	}
}

func waitForStableInflightCount(lggr logger.Logger, txm *txm.Txm, duration time.Duration) {
	const checkInterval = 200 * time.Millisecond
	stableSince := time.Now()
	stabilityReached := false

	for {
		queueLen, unconfirmedLen := txm.InflightCount()

		if queueLen == 0 && unconfirmedLen == 0 {
			if !stabilityReached {
				lggr.Debugw("Inflight count stable at zero, starting timer")
				stabilityReached = true
			}
			if time.Since(stableSince) >= duration {
				lggr.Debugw("Inflight count was stable for full duration", "duration", duration)
				return
			}
		} else {
			if stabilityReached {
				lggr.Warnw("Inflight count was stable but changed", "queueLen", queueLen, "unconfirmedLen", unconfirmedLen, "elapsed", time.Since(stableSince))
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

type testingAPIClientWrapped struct {
	mock.Mock
	ton.APIClientWrapped
}

func (m *testingAPIClientWrapped) SendExternalMessageWaitTransaction(ctx context.Context, ext *tlb.ExternalMessage) (*tlb.Transaction, *ton.BlockIDExt, []byte, error) {
	m.Called(ctx, ext)
	return m.APIClientWrapped.SendExternalMessageWaitTransaction(ctx, ext)
}
