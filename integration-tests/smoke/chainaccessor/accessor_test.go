package smoke

import (
	"context"
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"go.uber.org/zap/zapcore"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
	"github.com/smartcontractkit/chainlink/v2/core/logger"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	tonCommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/indexer"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	test_utils "github.com/smartcontractkit/chainlink-ton/integration-tests/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

// TODO: maybe it's better to reuse memory environment from deployment test
const ChainSelEVMTest90000001 = 909606746561742123

func Test_TonAccessorEventQueries(t *testing.T) {
	lggr := logger.TestLogger(t)
	ctx := t.Context()

	// TODO: maybe just set contracts directly, no need for full env support here
	env := memory.NewMemoryEnvironment(t, lggr, zapcore.InfoLevel, memory.MemoryEnvironmentConfig{
		Chains:    1,
		TonChains: 1,
	})

	// Get chain selectors
	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyEVM))[0]
	tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyTon))
	require.Len(t, tonChainSelectors, 1, "Expected exactly 1 Ton chain")
	chainSelector := tonChainSelectors[0]
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet
	t.Log("Deployer: ", deployer.Address().String())

	// memory environment doesn't block on funding so changesets can execute before the env is fully ready, manually call fund so we block here
	test_utils.FundWallets(t, tonChain.Client, []*address.Address{deployer.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})

	// -- deploy contracts
	cs := ops.DeployChainContractsToTonCS(t, env, chainSelector)
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// TODO: maybe just set contracts directly, no need for full env support here
	// -- add lane using helper function
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ops.AddTonLanes{}, config.UpdateTonLanesConfig{
			EVMMCMSConfig: &proposalutils.TimelockConfig{},
			TonMCMSConfig: &proposalutils.TimelockConfig{},
			Lanes: []config.LaneConfig{
				{
					Source: config.TonChainDefinition{
						ConnectionConfig: v1_6.ConnectionConfig{
							RMNVerificationDisabled: true,
							AllowListEnabled:        false,
						},
						Selector: chainSelector,
						GasPrice: big.NewInt(1e17),
						TokenPrices: map[*address.Address]*big.Int{
							ops.TonTokenAddr: big.NewInt(99),
						},
						FeeQuoterDestChainConfig: feequoter.DestChainConfig{ // minimal valid config
							IsEnabled:                         true,
							MaxNumberOfTokensPerMsg:           0,
							MaxDataBytes:                      100,
							MaxPerMsgGasLimit:                 100,
							DestGasOverhead:                   0,
							DestGasPerPayloadByteBase:         0,
							DestGasPerPayloadByteHigh:         0,
							DestGasPerPayloadByteThreshold:    0,
							DestDataAvailabilityOverheadGas:   0,
							DestGasPerDataAvailabilityByte:    0,
							DestDataAvailabilityMultiplierBps: 0,
							ChainFamilySelector:               0,
							EnforceOutOfOrder:                 false,
							DefaultTokenFeeUsdCents:           0,
							DefaultTokenDestGasOverhead:       0,
							DefaultTxGasLimit:                 1,
							GasMultiplierWeiPerEth:            0,
							GasPriceStalenessThreshold:        0,
							NetworkFeeUsdCents:                0,
						},
						TokenTransferFeeConfigs: map[uint64]feequoter.UpdateTokenTransferFeeConfig{
							// TODO:
						},
					},
					Dest: config.EVMChainDefinition{
						ChainDefinition: v1_6.ChainDefinition{
							Selector:                 evmSelector,
							GasPrice:                 big.NewInt(1e17),
							TokenPrices:              map[common.Address]*big.Int{},
							FeeQuoterDestChainConfig: v1_6.DefaultFeeQuoterDestChainConfig(true),
							ConnectionConfig: v1_6.ConnectionConfig{
								RMNVerificationDisabled: true,
								AllowListEnabled:        false,
							},
						},
						OnRampVersion: []byte{1, 6, 1},
					},
					IsDisabled: false,
				},
			},
			TestRouter: false,
		}),
	})
	require.NoError(t, err, "failed to add lane")

	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)

	// -- DEBUG: Check if framework UpdateFeeTokens worked --
	// The deployment logs show UpdateFeeTokens succeeded, but let's verify the storage
	t.Log("=== DEBUGGING FRAMEWORK FEE TOKEN CONFIGURATION ===")
	debugFeeQuoterAddr := state[chainSelector].FeeQuoter
	t.Logf("FeeQuoter deployed at: %s", debugFeeQuoterAddr.String())

	// Test the feeTokens getter immediately after deployment to see if framework UpdateFeeTokens worked
	debugCtx := t.Context()
	block, err := tonChain.Client.CurrentMasterchainInfo(debugCtx)
	require.NoError(t, err, "failed to get current block")

	feeTokensResult, err := tonChain.Client.RunGetMethod(debugCtx, block, &debugFeeQuoterAddr, "feeTokens")
	if err != nil {
		t.Errorf("Failed to call feeTokens getter: %v", err)
	} else {
		t.Logf("FeeTokens getter result immediately after deployment: %v", feeTokensResult)
	}

	// -- start logpoller
	lpCfg := logpoller.DefaultConfigSet
	logStore := inmemorystore.NewLogStore()
	filterStore := inmemorystore.NewFilterStore()
	loader := account.NewTxLoader(tonChain.Client, lggr, lpCfg.PageSize)
	indexer := indexer.NewIndexer(lggr, filterStore)

	opts := &logpoller.ServiceOptions{
		Config:    lpCfg,
		Client:    tonChain.Client,
		Filters:   filterStore,
		TxLoader:  loader,
		TxIndexer: indexer,
		Store:     logStore,
	}
	lp := logpoller.NewService(
		lggr,
		opts,
	)

	// -- initialize tonaccessor
	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(lggr, ccipocr3.ChainSelector(chainSelector), tonChain.Client, lp, addrCodec)
	require.NoError(t, aerr)

	onRampAddr := state[chainSelector].OnRamp

	// -- bind onramp in accessor
	rawOnRampAddr, err := addrCodec.AddressStringToBytes(onRampAddr.String())
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)

	// -- bind feequoter in accessor for price validation
	feeQuoterAddress := state[chainSelector].FeeQuoter
	rawFeeQuoterAddr, err := addrCodec.AddressStringToBytes(feeQuoterAddress.String())
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameFeeQuoter, rawFeeQuoterAddr)
	require.NoError(t, err)

	// -- register filter
	faerr := lp.RegisterFilter(ctx, types.Filter{
		Name:     "CCIPMessageSent",
		Address:  &onRampAddr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: hash.CRC32("CCIPMessageSent"),
	})
	require.NoError(t, faerr)

	// start listening for logs
	require.NoError(t, lp.Start(ctx))
	defer func() {
		require.NoError(t, lp.Close())
	}()

	// -- send CCIP message
	// _ = &client.CCIPSendReqConfig{
	// 	SourceChain:  chainSelector,
	// 	DestChain:    evmSelector,
	// 	IsTestRouter: false,
	// 	Sender:       nil,
	// 	Message:      nil,
	// 	MaxRetries:   3,
	// }
	// TODO: cannot use state[chainSelector] (map index expression of struct type "github.com/smartcontractkit/chainlink-ton/deployment/state".CCIPChainState) as stateview.CCIPOnChainState value in argument to ops.SendTonRequest
	// ops.SendTonRequest(env, state[chainSelector], msgCfg)

	// -- send CCIP message manually
	routerAddr := state[chainSelector].Router
	feeQuoterAddr := state[chainSelector].FeeQuoter

	t.Log("Router address: ", routerAddr.String())
	t.Log("OnRamp address: ", onRampAddr.String())
	t.Log("FeeQuoter address: ", feeQuoterAddr.String())

	// Debug: Check FeeQuoter configuration
	t.Log("=== DEBUGGING FEE QUOTER CONFIGURATION ===")
	t.Log("Fee token being used: ", ops.TonTokenAddr.String())

	// TODO: clean up, set fee token manually
	feeTokenDict := cell.NewDict(267) // key size for address
	feeToken := feequoter.FeeToken{PremiumMultiplierWeiPerEth: 1}
	feeTokenCell, err := tlb.ToCell(feeToken)
	require.NoError(t, err, "failed to encode FeeToken")

	// Add the fee token to dictionary (address as key)
	addressKeyCell := cell.BeginCell().MustStoreAddr(ops.TonTokenAddr).EndCell()
	err = feeTokenDict.Set(addressKeyCell, feeTokenCell)
	require.NoError(t, err, "failed to add fee token to dictionary")

	updateFeeTokensMsg := feequoter.UpdateFeeTokens{
		Add:    feeTokenDict,
		Remove: tonCommon.SnakeData[*address.Address]{}, // Empty remove list
	}

	updateFeeTokensCell, err := tlb.ToCell(updateFeeTokensMsg)
	require.NoError(t, err, "failed to encode UpdateFeeTokens message")

	updateFeeTokensInternalMsg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      false,
			DstAddr:     &feeQuoterAddr,
			Amount:      tlb.MustFromTON("0.01"),
			Body:        updateFeeTokensCell,
		},
	}

	ttConn := tracetracking.NewSignedAPIClient(tonChain.Client, *deployer)
	updateFeeTokensResult, updateFeeTokensBlockID, err := ttConn.SendWaitTransaction(ctx, feeQuoterAddr, updateFeeTokensInternalMsg)
	require.NoError(t, err, "failed to send UpdateFeeTokens transaction")

	t.Logf("UpdateFeeTokens transaction sent successfully - Block: %d, ExitCode: %d",
		updateFeeTokensBlockID.SeqNo, updateFeeTokensResult.ExitCode)

	// Validate fee token configuration before sending CCIP message
	t.Run("validate fee token configuration", func(t *testing.T) {
		// Test GetTokenPriceUSD to verify fee token is configured
		rawFeeTokenAddr, err := addrCodec.AddressStringToBytes(ops.TonTokenAddr.String())
		require.NoError(t, err, "failed to convert fee token address to bytes")

		timestampedPrice, err := accessor.GetTokenPriceUSD(ctx, rawFeeTokenAddr)
		if err != nil {
			t.Errorf("Fee token price lookup failed - this means the fee token is not configured in FeeQuoter: %v", err)
			t.Logf("Fee token address: %s", ops.TonTokenAddr.String())
			t.Logf("FeeQuoter address: %s", feeQuoterAddress.String())
			return
		}

		t.Logf("Fee token price successfully retrieved: %s USD (with 18 decimals)", timestampedPrice.Value.String())
		require.NotNil(t, timestampedPrice.Value, "fee token price should not be nil")
		require.True(t, timestampedPrice.Value.Cmp(big.NewInt(0)) > 0, "fee token price should be greater than 0")

		// Also validate destination chain configuration
		destChainConfig, err := accessor.GetFeeQuoterDestChainConfig(ctx, ccipocr3.ChainSelector(evmSelector))
		if err != nil {
			t.Errorf("Failed to get destination chain config: %v", err)
			return
		}
		t.Logf("Destination chain config retrieved successfully - IsEnabled: %t", destChainConfig.IsEnabled)
		require.True(t, destChainConfig.IsEnabled, "destination chain should be enabled")

		// DIRECT VERIFICATION: Test FeeQuoter getter functions to verify storage
		t.Log("=== DIRECT FEEQUOTER STORAGE VERIFICATION ===")

		// Get current block for getter calls
		block, err := tonChain.Client.CurrentMasterchainInfo(ctx)
		require.NoError(t, err, "failed to get current block")

		// Test tokenPrice getter directly on FeeQuoter contract
		tokenAddressSlice := cell.BeginCell().MustStoreAddr(ops.TonTokenAddr).EndCell().BeginParse()
		tokenPriceResult, err := tonChain.Client.RunGetMethod(ctx, block, &feeQuoterAddress, "tokenPrice", tokenAddressSlice)
		if err != nil {
			t.Errorf("Direct tokenPrice getter failed: %v", err)
		} else {
			t.Logf("Direct tokenPrice getter succeeded: %v", tokenPriceResult)
		}

		// Test feeTokens getter to verify premium multiplier storage
		feeTokensResult, err := tonChain.Client.RunGetMethod(ctx, block, &feeQuoterAddress, "feeTokens")
		if err != nil {
			t.Errorf("Direct feeTokens getter failed: %v", err)
		} else {
			t.Logf("Direct feeTokens getter succeeded: %v", feeTokensResult)
		}
	})
	// TODO: use sendmanytx or highload wallet
	time.Sleep(5 * time.Second)

	const lastSeqNo = 2
	for seqNo := 0; seqNo <= lastSeqNo; seqNo++ {
		t.Log("Sending CCIP message", seqNo)
		sendCCIPMessage(t, ctx, evmSelector, routerAddr, tonChain.Client, deployer)
		time.Sleep(2 * time.Second)
	}

	t.Run("query CCIP message via TonAccessor", func(t *testing.T) {
		require.Eventually(t, func() bool {
			seqNum, err := accessor.LatestMessageTo(ctx, ccipocr3.ChainSelector(evmSelector))
			require.NoError(t, err, "failed to get latest message sequence number")
			return seqNum == ccipocr3.SeqNum(lastSeqNo)
		}, 30*time.Second, 3*time.Second, "log poller did not ingest events correctly in time")
	})

	t.Run("query CCIP message via TonAccessor", func(t *testing.T) {
		require.Eventually(t, func() bool {
			const msgCount = 2
			const start = 1
			const end = 2
			msgs, err := accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(start, end))
			require.NoError(t, err, "failed to get latest message sequence number")
			return len(msgs) == msgCount && msgs[0].Header.SequenceNumber == ccipocr3.SeqNum(start) && msgs[1].Header.SequenceNumber == ccipocr3.SeqNum(end)
		}, 30*time.Second, 3*time.Second, "log poller did not ingest events correctly in time")
	})
}

// TODO: clean up
func sendCCIPMessage(t *testing.T, ctx context.Context, evmSelector uint64, routerAddr address.Address, client ton.APIClientWrapped, deployer *wallet.Wallet) {
	extraArgs := onramp.GenericExtraArgsV2{
		GasLimit:                 big.NewInt(100),
		AllowOutOfOrderExecution: false,
	}

	extraArgsCell, err := tlb.ToCell(extraArgs)
	require.NoError(t, err)

	t.Log("=== DEBUGGING FEE TOKEN CONFIGURATION ===")
	t.Log("Fee token address being used:", ops.TonTokenAddr.String())

	// Use the proper Go struct with TLB serialization instead of manual construction
	body, err := tlb.ToCell(router.CCIPSend{
		QueryID:           rand.Uint64(),
		DestChainSelector: evmSelector,
		Receiver:          tonCommon.CrossChainAddress(make([]byte, 20)),
		Data:              tonCommon.SnakeBytes([]byte("tons of fun")),
		TokenAmounts:      tonCommon.SnakeRef[router.TokenAmount]{}, // Empty token amounts for no token transfers
		FeeToken:          ops.TonTokenAddr,
		ExtraArgs:         extraArgsCell,
	})
	require.NoError(t, err)

	msg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      false,
			DstAddr:     &routerAddr,
			Amount:      tlb.MustFromTON("1.0"),
			Body:        body,
		},
	}

	ttConn := tracetracking.NewSignedAPIClient(client, *deployer)
	rMsg, blockID, err := ttConn.SendWaitTransaction(ctx, routerAddr, msg)
	require.NoError(t, err, "failed to send message")

	t.Log("transaction sent", "blockID", blockID, "receivedMsg", rMsg)

	// Log transaction fees for debugging
	t.Logf("Transaction fees - Storage: %v, Gas: %v, Total Action: %v, Magic: %v",
		rMsg.StorageFeeCharged, rMsg.GasFee, rMsg.TotalActionFees, rMsg.MagicFee)
	t.Logf("Total execution fee: %v", rMsg.TotalTransactionExecutionFee())

	// Check initial transaction exit code
	t.Logf("Initial transaction exit code: %v, %s", rMsg.ExitCode, rMsg.ExitCode.Describe())
	t.Logf("Initial transaction success: %v", rMsg.Success)
	t.Logf("Initial transaction bounced: %v", rMsg.EmittedBouncedMessage)
	require.Equal(t, int32(0), int32(rMsg.ExitCode), "initial transaction failed with exit code %v", rMsg.ExitCode)
	require.True(t, rMsg.Success, "initial transaction was not successful")
	require.False(t, rMsg.EmittedBouncedMessage, "initial transaction was bounced")

	// Wait for complete trace and check for failures
	err = rMsg.WaitForTrace(client)
	require.NoError(t, err, "failed to wait for trace")

	// Print detailed trace summary for debugging
	t.Log("=== DETAILED TRACE ANALYSIS ===")
	rMsg.PrintTraceSummary()

	// Check outcome exit code (includes all outgoing messages)
	outcomeExitCode := rMsg.OutcomeExitCode()
	t.Logf("Outcome exit code (including all outgoing messages): %v", outcomeExitCode.Describe())
	require.Equal(t, int32(0), int32(outcomeExitCode), "transaction trace failed with exit code %v", outcomeExitCode)

	// Enhanced trace validation with detailed logging
	t.Log("=== TRACE VALIDATION ===")
	// traceSucceeded := rMsg.TraceSucceeded()
	// require.True(t, traceSucceeded, "transaction trace validation failed")

	// Log details about outgoing messages
	t.Logf("Number of outgoing internal messages: %d", len(rMsg.OutgoingInternalReceivedMessages))
	for i, outMsg := range rMsg.OutgoingInternalReceivedMessages {
		t.Logf("Outgoing message %d: exit code %v, success: %v, bounced: %v, status: %v",
			i, outMsg.ExitCode, outMsg.Success, outMsg.EmittedBouncedMessage, outMsg.Status())
		if outMsg.ExitCode != 0 {
			t.Errorf("Outgoing message %d failed with exit code %v", i, outMsg.ExitCode)
		}
		if !outMsg.Success {
			t.Errorf("Outgoing message %d was not successful", i)
		}
		if outMsg.EmittedBouncedMessage {
			t.Errorf("Outgoing message %d was bounced", i)
		}
	}
}
