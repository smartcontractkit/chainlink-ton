package ccip

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"testing"

	chainselectors "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"google.golang.org/grpc"

	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	cs_ccip "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	txloader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ccip/chainconfig"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/rmn_home"
	capabilities_registry "github.com/smartcontractkit/chainlink-evm/gethwrappers/keystone/generated/capabilities_registry_1_1_0"
	"github.com/smartcontractkit/chainlink-protos/job-distributor/v1/node"
	"github.com/smartcontractkit/chainlink-protos/job-distributor/v1/shared/ptypes"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccip/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
	"github.com/smartcontractkit/chainlink/deployment/common/types"

	"github.com/smartcontractkit/chainlink-common/keystore/corekeys/p2pkey"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	ccipcaptypes "github.com/smartcontractkit/chainlink/v2/core/capabilities/ccip/types"

	mocks "github.com/smartcontractkit/chainlink-ton/deployment/mocks/client"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	deployutils "github.com/smartcontractkit/chainlink-ton/deployment/utils"

	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences" // Register TON adapter
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
)

func TestWalletInit(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)

	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().Build(t)
	require.NoError(t, err)

	tonSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyTon))[0]
	tonChain := env.BlockChains.TonChains()[tonSelector]

	w, err := tvm.NewRandomV5R1TestWallet(tonChain.Client, -217)
	require.NoError(t, err)

	block, err := tonChain.Client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)

	balance, err := tonChain.Wallet.GetBalance(t.Context(), block)
	require.NoError(t, err)
	t.Logf("Deployer wallet balance before funding: %s", balance.String())

	client := tracetracking.NewSignedAPIClient(tonChain.Client, *tonChain.Wallet)

	// Notice: send message before init, trace uninitialized
	amount := tlb.MustFromTON("0.05")

	// Notice: first we try to send without wallet.IgnoreErrors (exit code 137 for W.V5R1)
	m, err := client.SendAndWaitForTrace(t.Context(), *w.WalletAddress(),
		&wallet.Message{
			Mode: wallet.PayGasSeparately,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      false,
				DstAddr:     w.WalletAddress(),
				Amount:      amount,
				Body:        nil,
			},
		})
	require.NoError(t, err)

	ec, err := m.ExitCode()
	require.NoError(t, err)
	require.Equal(t, tvm.ExitCode(137), ec) // Send fails with 137 exit code without using wallet.IgnoreErrors

	block, err = tonChain.Client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)

	balance, err = w.GetBalance(t.Context(), block)
	require.NoError(t, err)
	t.Logf("Target wallet balance after initial funding attempt: %s", balance.String())
	require.Equal(t, "0", balance.String(), "Balance should be 0 since the message should not go through without wallet.IgnoreErrors")

	// Notice: using wallet.IgnoreErrors will send the message to the target (DstAddr)
	m, err = client.SendAndWaitForTrace(t.Context(), *w.WalletAddress(),
		&wallet.Message{
			Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      false,
				DstAddr:     w.WalletAddress(),
				Amount:      amount,
				Body:        nil,
			},
		})
	require.NoError(t, err)

	ec, err = m.ExitCode()
	require.NoError(t, err)
	require.Equal(t, tvm.ExitCodeSuccess, ec) // Uninitialized acc, action phase would fail but we use wallet.IgnoreErrors

	ectrace, err := m.TraceExitCode()
	require.NoError(t, err)
	require.Equal(t, tvm.ExitCodeComputeSkipReasonNoState, ectrace) // Uninitialized acc should skip compute phase with no state

	block, err = tonChain.Client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)

	acc, err := tonChain.Client.GetAccount(t.Context(), block, w.Address())
	require.NoError(t, err)
	require.Nil(t, acc.Code, "Code should be nil for uninitialized wallet")

	balance, err = w.GetBalance(t.Context(), block)
	require.NoError(t, err)
	t.Logf("Target wallet balance after second funding attempt (wallet.IgnoreErrors): %s", balance.String())
	require.Equal(t, -1, tlb.ZeroCoins.Compare(&balance), "Balance should be greater than 0 after funding")

	// Fund wallet with amount and deploy
	err = tvm.NewInitializedWallet(t.Context(), tonChain.Wallet, w, amount)
	require.NoError(t, err)

	block, err = tonChain.Client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)

	acc, err = tonChain.Client.GetAccount(t.Context(), block, w.Address())
	require.NoError(t, err)
	require.NotNil(t, acc.Code, "Code should not be nil after wallet initialization")

	balance, err = w.GetBalance(t.Context(), block)
	require.NoError(t, err)
	t.Logf("Target wallet balance after deployment: %s", balance.String())

	// Notice: send message post init, trace success
	m, err = client.SendAndWaitForTrace(t.Context(), *w.WalletAddress(),
		&wallet.Message{
			// Notice: wallet.IgnoreErrors is required by W.V5R1
			Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      false,
				DstAddr:     w.WalletAddress(),
				Amount:      amount,
				Body:        nil,
			},
		})
	require.NoError(t, err)

	ec, err = m.ExitCode()
	require.NoError(t, err)
	require.Equal(t, tvm.ExitCodeSuccess, ec) // Initialized wallet should accept message

	ectrace, err = m.TraceExitCode()
	require.NoError(t, err)
	require.Equal(t, tvm.ExitCodeSuccess, ectrace) // Initialized wallet should accept message
}

func TestDeployContractsAndSetOCR3ConfigWithDeployerAPI(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)

	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().WithEVM().Build(t)
	require.NoError(t, err)

	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyEVM))[0]
	tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyTon))
	require.Len(t, tonChainSelectors, 1, "Expected exactly 1 Ton chain")
	tonSelector := tonChainSelectors[0]

	t.Log("EVM Chain Selector:", evmSelector)
	t.Log("TON Chain Selector:", tonSelector)

	version := deployutils.ContractsVersionLocal

	// Testing DeployContracts from Tooling API, and SetOCR3Config, without calling AddLane
	dReg := deployops.GetRegistry()
	output, err := deployops.DeployContracts(dReg).Apply(env, deployops.ContractDeploymentConfig{
		Chains: map[uint64]deployops.ContractDeploymentConfigPerChain{
			tonSelector: {
				Version:                                 &tonstate.Version1_6_0,
				TokenDecimals:                           9,
				MaxFeeJuelsPerMsg:                       big.NewInt(1),
				TokenPriceStalenessThreshold:            0,
				LinkPremiumMultiplier:                   1,
				PermissionLessExecutionThresholdSeconds: 0,
				ContractVersion:                         version,
			},
		},
	})
	require.NoError(t, err, "Failed to deploy TON chain contracts")
	t.Log("Successfully deployed TON chain contracts")

	// Merge deployed contract addresses into environment datastore
	require.NoError(t, output.DataStore.Merge(env.DataStore))
	env.DataStore = output.DataStore.Seal()

	// Test idempotency by deploying again
	dReg = deployops.GetRegistry()
	output, err = deployops.DeployContracts(dReg).Apply(env, deployops.ContractDeploymentConfig{
		Chains: map[uint64]deployops.ContractDeploymentConfigPerChain{
			tonSelector: {
				Version:                                 &tonstate.Version1_6_0,
				TokenDecimals:                           9,
				MaxFeeJuelsPerMsg:                       big.NewInt(1),
				TokenPriceStalenessThreshold:            0,
				LinkPremiumMultiplier:                   1,
				PermissionLessExecutionThresholdSeconds: 0,
				ContractVersion:                         version,
			},
		},
	})
	require.NoError(t, err, "Failed to deploy TON chain contracts")

	// Merge deployed contract addresses into environment datastore
	require.NoError(t, output.DataStore.Merge(env.DataStore))
	env.DataStore = output.DataStore.Seal()

	// 4 nodes required for F=1 fault tolerance: F = (n-1)/3 = 1, must be >= FChain
	numNodes := 4

	p2pKeys := make([]p2pkey.KeyV2, numNodes)
	testP2PIDs := make([][32]byte, numNodes)
	for i := 0; i < numNodes; i++ {
		var key p2pkey.KeyV2
		key, err = p2pkey.NewV2()
		require.NoError(t, err, "failed to generate p2p key")
		p2pKeys[i] = key
		testP2PIDs[i] = key.PeerID()

		for j := 0; j < i; j++ {
			require.NotEqual(t, testP2PIDs[i], testP2PIDs[j], "P2P keys must be unique, but node %d and %d have the same peer ID", i, j)
		}
	}

	// Mock nodes for v1_6 changesets (simulates Job Distributor responses)
	mockNodes := make([]*node.Node, numNodes)
	nodeIDs := make([]string, numNodes)
	for i := range p2pKeys {
		peerIDStr := p2pKeys[i].PeerID().String()
		nodeIDs[i] = peerIDStr
		mockNodes[i] = &node.Node{
			Id:        peerIDStr,
			Name:      fmt.Sprintf("node-%d", i+1),
			PublicKey: hex.EncodeToString(testP2PIDs[i][:]),
			Labels: []*ptypes.Label{
				{Key: "p2p_id", Value: &peerIDStr},
			},
		}
	}

	tonChainID, err := chainselectors.GetChainIDFromSelector(tonSelector)
	require.NoError(t, err, "failed to get TON chain ID from selector")
	env.NodeIDs = nodeIDs
	env.Offchain = setupMockOffChainClient(t, mockNodes, tonChainID)
	testNodeOperator := "TestNodeOperator"

	// In order to test SetOCR3Config end-to-end, we need to run few steps to set up Home chain configuration
	// Step 1: Deploy home chain (CCIPHome, CapabilitiesRegistry, RMNHome)
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(cldf.CreateLegacyChangeSet(v1_6.DeployHomeChainChangeset), v1_6.DeployHomeChainConfig{
			HomeChainSel: evmSelector,
			RMNStaticConfig: rmn_home.RMNHomeStaticConfig{
				Nodes:          []rmn_home.RMNHomeNode{},
				OffchainConfig: []byte{},
			},
			RMNDynamicConfig: rmn_home.RMNHomeDynamicConfig{
				SourceChains:   []rmn_home.RMNHomeSourceChain{},
				OffchainConfig: []byte{},
			},
			NodeOperators: []capabilities_registry.CapabilitiesRegistryNodeOperator{
				{
					Admin: env.BlockChains.EVMChains()[evmSelector].DeployerKey.From,
					Name:  testNodeOperator,
				},
			},
			NodeP2PIDsPerNodeOpAdmin: map[string][][32]byte{
				testNodeOperator: testP2PIDs,
			},
		}),
	})
	require.NoError(t, err, "failed to deploy home chain")

	// Step 2: Deploy MCMS with Timelock (required for ValidateOwnership)
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(cldf.CreateLegacyChangeSet(commonchangeset.DeployMCMSWithTimelockV2), map[uint64]types.MCMSWithTimelockConfigV2{
			evmSelector: {
				Proposer:         proposalutils.SingleGroupMCMSV2(t),
				Bypasser:         proposalutils.SingleGroupMCMSV2(t),
				Canceller:        proposalutils.SingleGroupMCMSV2(t),
				TimelockMinDelay: big.NewInt(0),
			},
		}),
	})
	require.NoError(t, err, "failed to deploy MCMS with timelock")

	// Step 3: Add TON chain config to CCIPHome
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(cldf.CreateLegacyChangeSet(v1_6.UpdateChainConfigChangeset), v1_6.UpdateChainConfigConfig{
			HomeChainSelector: evmSelector,
			RemoteChainAdds: map[uint64]v1_6.ChainConfig{
				tonSelector: {
					Readers: testP2PIDs,
					FChain:  1,
					EncodableChainConfig: chainconfig.ChainConfig{
						GasPriceDeviationPPB:    ccipocr3.NewBigIntFromInt64(1000),
						DAGasPriceDeviationPPB:  ccipocr3.NewBigIntFromInt64(1000),
						OptimisticConfirmations: 1,
					},
				},
			},
		}),
	})
	require.NoError(t, err, "failed to update chain config")

	// Step 4: Add DON and set commit plugin candidate
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(cldf.CreateLegacyChangeSet(v1_6.AddDonAndSetCandidateChangeset), v1_6.AddDonAndSetCandidateChangesetConfig{
			SetCandidateConfigBase: v1_6.SetCandidateConfigBase{
				HomeChainSelector: evmSelector,
				FeedChainSelector: evmSelector,
			},
			PluginInfo: v1_6.SetCandidatePluginInfo{
				OCRConfigPerRemoteChainSelector: map[uint64]v1_6.CCIPOCRParams{
					tonSelector: v1_6.OcrParamsForTest,
				},
				PluginType: ccipcaptypes.PluginTypeCCIPCommit,
			},
		}),
	})
	require.NoError(t, err, "failed to add DON and set candidate for commit")

	// Step 5: Set exec plugin candidate
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(cldf.CreateLegacyChangeSet(v1_6.SetCandidateChangeset), v1_6.SetCandidateChangesetConfig{
			SetCandidateConfigBase: v1_6.SetCandidateConfigBase{
				HomeChainSelector: evmSelector,
				FeedChainSelector: evmSelector,
			},
			PluginInfo: []v1_6.SetCandidatePluginInfo{
				{
					OCRConfigPerRemoteChainSelector: map[uint64]v1_6.CCIPOCRParams{
						tonSelector: v1_6.OcrParamsForTest,
					},
					PluginType: ccipcaptypes.PluginTypeCCIPExec,
				},
			},
		}),
	})
	require.NoError(t, err, "failed to set candidate for exec")

	// Step 6: Promote candidates to active
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(cldf.CreateLegacyChangeSet(v1_6.PromoteCandidateChangeset), v1_6.PromoteCandidateChangesetConfig{
			HomeChainSelector: evmSelector,
			PluginInfo: []v1_6.PromoteCandidatePluginInfo{
				{
					RemoteChainSelectors: []uint64{tonSelector},
					PluginType:           ccipcaptypes.PluginTypeCCIPCommit,
				},
				{
					RemoteChainSelectors: []uint64{tonSelector},
					PluginType:           ccipcaptypes.PluginTypeCCIPExec,
				},
			},
		}),
	})
	require.NoError(t, err, "failed to promote candidate")

	// Finally, test SetOCR3Config from tooling deployer API
	mcmsRegistry := cs_ccip.GetRegistry()
	_, err = deployops.SetOCR3Config(dReg, mcmsRegistry).Apply(env, deployops.SetOCR3ConfigArgs{
		HomeChainSel:    evmSelector,
		RemoteChainSels: tonChainSelectors,
		ConfigType:      utils.ConfigTypeActive,
	})
	require.NoError(t, err, "Failed to apply SetOCR3Config changeset")
	t.Log("Successfully set OCR3 config on TON offRamp")

	// initialize accessor to verify configuration
	// -- TON Accessor tests
	lpCfg := logpoller.DefaultConfigSet
	filterStore := inmemorystore.NewFilterStore("test-chain", lggr)
	tonChain := env.BlockChains.TonChains()[tonSelector]
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return tonChain.Client, nil
	}
	opts := &logpoller.ServiceOptions{
		Config:      lpCfg,
		FilterStore: filterStore,
		TxLoader:    txloader.New(lggr, clientProvider),
		LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
	}
	lp, err := logpoller.NewService(lggr, "test-chain",
		clientProvider,
		opts,
	)
	require.NoError(t, err)
	addrCodec := codec.NewAddressCodec()
	accessor, err := chainaccessor.NewTONAccessor(lggr, ccipocr3.ChainSelector(tonSelector), clientProvider, lp, addrCodec)
	require.NoError(t, err)

	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)
	onRampAddr := state[tonSelector].OnRamp
	rawOnRampAddr, err := addrCodec.AddressStringToBytes(onRampAddr.String())
	require.NoError(t, err)
	offRampAddr := state[tonSelector].OffRamp
	rawOffRampAddr, err := addrCodec.AddressStringToBytes(offRampAddr.String())
	require.NoError(t, err)
	feeQuoterAddr := state[tonSelector].FeeQuoter
	rawFeeQuoterAddr, err := addrCodec.AddressStringToBytes(feeQuoterAddr.String())
	require.NoError(t, err)

	err = accessor.Sync(t.Context(), consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(t.Context(), consts.ContractNameOffRamp, rawOffRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(t.Context(), consts.ContractNameFeeQuoter, rawFeeQuoterAddr)
	require.NoError(t, err)

	t.Run("StateViewAfterDeployContracts", func(t *testing.T) {
		var generatedView tonstate.TONChainView
		generatedView, err = state[tonSelector].GenerateView(&env, tonSelector, "-1")
		require.NoError(t, err)
		require.Equal(t, "-1", generatedView.ChainID)
		require.Equal(t, tonSelector, generatedView.ChainSelector)
		onRampView, exit := generatedView.OnRamp[onRampAddr.String()]
		require.True(t, exit, "onRamp view not found")
		require.Equal(t, onRampAddr, *onRampView.Address)

		router := state[tonSelector].Router
		routerView, exit := generatedView.Router[router.String()]
		require.True(t, exit, "onRamp view not found")
		require.Equal(t, router, *routerView.Address)

		feeQuoterView, exit := generatedView.FeeQuoter[feeQuoterAddr.String()]
		require.True(t, exit, "feeQuoter view not found")
		require.Equal(t, feeQuoterAddr, *feeQuoterView.Address)

		var data []byte
		offRampView, exit := generatedView.OffRamp[offRampAddr.String()]
		require.True(t, exit, "offRamp view not found")
		require.Equal(t, offRampAddr, *offRampView.Address)
		require.Equal(t, tonSelector, offRampView.Config.ChainSelector)
		require.Equal(t, feeQuoterAddr.String(), offRampView.Config.FeeQuoterAddress.String())
		data, err = json.MarshalIndent(generatedView, "", "  ")
		require.NoError(t, err)
		fmt.Print("JSON encoded TON state view:\n" + string(data))
	})

	t.Run("GetConfigAfterSetOCR3Config", func(t *testing.T) {
		// Load onchain state to get contract addresses
		state, err = tonstate.LoadOnchainState(env)
		require.NoError(t, err)

		// Get addresses from state and convert to raw bytes
		feeQuoterAddr = state[tonSelector].FeeQuoter
		rawFeeQuoterAddr, err = addrCodec.AddressStringToBytes(feeQuoterAddr.String())
		require.NoError(t, err)

		// Compute expected signers and transmitters from mock node setup
		// Mock nodes generate OCR keys as: ocrKeyBytes[j] = byte(nodeIdx + 1 + j) for j in 0..31
		signers := make([][]byte, numNodes)
		transmitters := make([][]byte, numNodes)
		for nodeIdx := 0; nodeIdx < numNodes; nodeIdx++ {
			var ocrKeyBytes [32]byte
			for j := 0; j < 32; j++ {
				ocrKeyBytes[j] = byte(nodeIdx + 1 + j)
			}
			signers[nodeIdx] = ocrKeyBytes[:]
			tonAddr := address.NewAddress(0, 0, ocrKeyBytes[:])
			transmitterBytes, err := addrCodec.AddressStringToBytes(tonAddr.String())
			require.NoError(t, err)
			transmitters[nodeIdx] = transmitterBytes
		}

		// destination - query config and verify OCR3 was set correctly
		cfg, _, err := accessor.GetAllConfigsLegacy(t.Context(), ccipocr3.ChainSelector(tonSelector), []ccipocr3.ChainSelector{ccipocr3.ChainSelector(evmSelector)})
		require.NoError(t, err)

		// Verify commit OCR config
		commitConfig := cfg.Offramp.CommitLatestOCRConfig.OCRConfig
		require.Equal(t, uint8(1), commitConfig.ConfigInfo.F)
		require.Equal(t, uint8(4), commitConfig.ConfigInfo.N)
		require.True(t, commitConfig.ConfigInfo.IsSignatureVerificationEnabled)
		require.Equal(t, signers, commitConfig.Signers)
		require.Equal(t, transmitters, commitConfig.Transmitters)

		// Verify exec OCR config
		execConfig := cfg.Offramp.ExecLatestOCRConfig.OCRConfig
		require.Equal(t, uint8(1), execConfig.ConfigInfo.F)
		require.Equal(t, uint8(0), execConfig.ConfigInfo.N) // exec doesn't use signature verification
		require.False(t, execConfig.ConfigInfo.IsSignatureVerificationEnabled)
		require.Equal(t, [][]byte{}, execConfig.Signers)
		require.Equal(t, transmitters, execConfig.Transmitters)

		// Verify static config
		require.Equal(t, ccipocr3.ChainSelector(tonSelector), cfg.Offramp.StaticConfig.ChainSelector)

		// Verify dynamic config
		require.Equal(t, rawFeeQuoterAddr, cfg.Offramp.DynamicConfig.FeeQuoter)
		require.True(t, cfg.Offramp.DynamicConfig.IsRMNVerificationDisabled)
	})
}

// setupMockOffChainClient configures a mockery-generated Client mock to simulate
// the Job Distributor for testing v1_6 changesets to return the mocked transmitter keys, ocr3 config etc.
func setupMockOffChainClient(t *testing.T, nodes []*node.Node, tonChainID string) *mocks.Client {
	mockClient := mocks.NewClient(t)

	// ListNodes returns all nodes
	mockClient.EXPECT().ListNodes(mock.Anything, mock.Anything).
		Return(&node.ListNodesResponse{Nodes: nodes}, nil).Maybe()

	// ListNodeChainConfigs returns EVM and TON chain configs for each node
	mockClient.EXPECT().ListNodeChainConfigs(mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, in *node.ListNodeChainConfigsRequest, _ ...grpc.CallOption) (*node.ListNodeChainConfigsResponse, error) {
			var configs []*node.ChainConfig

			requestedNodeIDs := make(map[string]bool)
			if in.Filter != nil {
				for _, id := range in.Filter.NodeIds {
					requestedNodeIDs[id] = true
				}
			}

			for nodeIdx, n := range nodes {
				if len(requestedNodeIDs) > 0 && !requestedNodeIDs[n.Id] {
					continue
				}

				var peerIDStr string
				for _, label := range n.Labels {
					if label.Key == "p2p_id" && label.Value != nil {
						peerIDStr = *label.Value
						break
					}
				}
				if peerIDStr == "" {
					continue
				}

				// Generate unique OCR keys per node
				var ocrKeyBytes [32]byte
				for j := 0; j < 32; j++ {
					ocrKeyBytes[j] = byte(nodeIdx + 1 + j)
				}

				configs = append(configs, &node.ChainConfig{
					NodeId: n.Id,
					Chain: &node.Chain{
						Id:   "1",
						Type: node.ChainType_CHAIN_TYPE_EVM,
					},
					Ocr2Config: &node.OCR2Config{
						OcrKeyBundle: &node.OCR2Config_OCRKeyBundle{
							BundleId:              "bundle-evm-" + n.Id,
							OnchainSigningAddress: hex.EncodeToString(ocrKeyBytes[:20]),
							OffchainPublicKey:     hex.EncodeToString(ocrKeyBytes[:32]),
							ConfigPublicKey:       hex.EncodeToString(ocrKeyBytes[:32]),
						},
						P2PKeyBundle: &node.OCR2Config_P2PKeyBundle{
							PeerId: peerIDStr,
						},
					},
					AccountAddress: "0x" + hex.EncodeToString(ocrKeyBytes[:20]),
				})
				// TON chain config (required by AddDonAndSetCandidateChangeset for TON family OCR setup)
				if tonChainID != "" {
					tonAddr := address.NewAddress(0, 0, ocrKeyBytes[:])
					configs = append(configs, &node.ChainConfig{
						NodeId: n.Id,
						Chain: &node.Chain{
							Id:   tonChainID,
							Type: node.ChainType_CHAIN_TYPE_TON,
						},
						Ocr2Config: &node.OCR2Config{
							OcrKeyBundle: &node.OCR2Config_OCRKeyBundle{
								BundleId:              "bundle-ton-" + n.Id,
								OnchainSigningAddress: hex.EncodeToString(ocrKeyBytes[:32]),
								OffchainPublicKey:     hex.EncodeToString(ocrKeyBytes[:32]),
								ConfigPublicKey:       hex.EncodeToString(ocrKeyBytes[:32]),
							},
							P2PKeyBundle: &node.OCR2Config_P2PKeyBundle{
								PeerId: peerIDStr,
							},
						},
						AccountAddress: tonAddr.String(),
					})
				}
			}
			return &node.ListNodeChainConfigsResponse{ChainConfigs: configs}, nil
		}).Maybe()

	// GetNode returns a specific node by ID
	mockClient.EXPECT().GetNode(mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, in *node.GetNodeRequest, _ ...grpc.CallOption) (*node.GetNodeResponse, error) {
			for _, n := range nodes {
				if n.Id == in.Id {
					return &node.GetNodeResponse{Node: n}, nil
				}
			}
			return nil, fmt.Errorf("node not found: %s", in.Id)
		}).Maybe()

	return mockClient
}
