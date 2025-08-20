package smoke

import (
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

const ChainSelEVMTest90000001 = 909606746561742123

func Test_TonAccessorEventQueries(t *testing.T) {
	lggr := logger.TestLogger(t)
	ctx := t.Context()

	// TODO: maybe just set contracts directly(or use ops directly), no need for full env support here
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

	// TODO: maybe just set contracts directly(or use ops directly), no need for full env support here
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

	routerAddr := state[chainSelector].Router
	feeQuoterAddr := state[chainSelector].FeeQuoter

	// TODO: missing in changeset ------------------
	// set fee token manually
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

	tt := tracetracking.NewSignedAPIClient(tonChain.Client, *deployer)
	updateFeeTokensResult, updateFeeTokensBlockID, err := tt.SendWaitTransaction(ctx, feeQuoterAddr, updateFeeTokensInternalMsg)
	require.NoError(t, err, "failed to send UpdateFeeTokens transaction")

	t.Logf("UpdateFeeTokens transaction sent successfully - Block: %d, ExitCode: %d",
		updateFeeTokensBlockID.SeqNo, updateFeeTokensResult.ExitCode)

	// TODO: missing in changeset ------------------ end

	// TODO: use sendmanytx or highload wallet, otherwise we get 33 exit code(too many actions)
	time.Sleep(5 * time.Second)

	const lastSeqNo = 4
	for seqNo := 0; seqNo <= lastSeqNo; seqNo++ {
		t.Log("Sending CCIP message", seqNo)
		sendCCIPMessage(t, evmSelector, routerAddr, tonChain.Client, deployer)
		time.Sleep(2 * time.Second)
	}

	t.Run("query CCIP events via TonAccessor", func(t *testing.T) {
		// check the latest message is indexed
		require.Eventually(t, func() bool {
			seqNum, err := accessor.LatestMessageTo(ctx, ccipocr3.ChainSelector(evmSelector))
			require.NoError(t, err, "failed to get latest message sequence number")
			return seqNum == ccipocr3.SeqNum(lastSeqNo)
		}, 30*time.Second, 3*time.Second, "log poller did not ingest events correctly in time")

		// check all messages are indexed
		msgs, err := accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(0, lastSeqNo))
		require.NoError(t, err, "failed to get latest message sequence number")
		require.Len(t, msgs, lastSeqNo+1, "expected %d messages, got %d", lastSeqNo+1, len(msgs))
		require.Equal(t, msgs[0].Header.SequenceNumber, ccipocr3.SeqNum(0))
		require.Equal(t, msgs[lastSeqNo].Header.SequenceNumber, ccipocr3.SeqNum(lastSeqNo))

		// range query
		const start, end = 2, 4
		msgs2, err := accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(start, end))
		require.NoError(t, err, "failed to get latest message sequence number")
		require.Len(t, msgs2, end-start+1, "expected %d messages, got %d", end-start+1, len(msgs2))
		require.Equal(t, msgs2[0].Header.SequenceNumber, ccipocr3.SeqNum(start))
		require.Equal(t, msgs2[len(msgs2)-1].Header.SequenceNumber, ccipocr3.SeqNum(end))
	})
}

// TODO: clean up
func sendCCIPMessage(t *testing.T, evmSelector uint64, routerAddr address.Address, client ton.APIClientWrapped, deployer *wallet.Wallet) {
	extraArgs := onramp.GenericExtraArgsV2{
		GasLimit:                 big.NewInt(100),
		AllowOutOfOrderExecution: false,
	}

	extraArgsCell, err := tlb.ToCell(extraArgs)
	require.NoError(t, err)

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
	rMsg, _, err := ttConn.SendWaitTransaction(t.Context(), routerAddr, msg)
	require.NoError(t, err, "failed to send message")
	err = rMsg.WaitForTrace(client)
	require.NoError(t, err, "failed to wait for trace")
}
