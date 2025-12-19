package ccip

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	chainselectors "github.com/smartcontractkit/chain-selectors"
	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	cs_ccip "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"

	"github.com/smartcontractkit/chainlink-ccip/chainconfig"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/rmn_home"
	capabilities_registry "github.com/smartcontractkit/chainlink-evm/gethwrappers/keystone/generated/capabilities_registry_1_1_0"
	csav1 "github.com/smartcontractkit/chainlink-protos/job-distributor/v1/csa"
	jobv1 "github.com/smartcontractkit/chainlink-protos/job-distributor/v1/job"
	nodev1 "github.com/smartcontractkit/chainlink-protos/job-distributor/v1/node"
	"github.com/smartcontractkit/chainlink-protos/job-distributor/v1/shared/ptypes"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
	"github.com/smartcontractkit/chainlink/deployment/common/types"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	ccipcaptypes "github.com/smartcontractkit/chainlink/v2/core/capabilities/ccip/types"
	"github.com/smartcontractkit/chainlink/v2/core/services/keystore/keys/p2pkey"

	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences" // Register TON adapter
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
)

func TestSetOCR3ConfigWithDeployerAPI(t *testing.T) {
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

	// Deploy TON chain contracts (uses LINK token workaround not available in deployops.DeployContracts)
	contractID, err := tonops.RandomUint32()
	require.NoError(t, err)
	cs := commonchangeset.Configure(tonops.DeployCCIPContracts{}, tonops.DeployChainContractsConfig(t, env, tonSelector, sequence.ContractsLocalVersion, contractID))
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy TON chain contracts")

	// 4 nodes required for F=1 fault tolerance: F = (n-1)/3 = 1, must be >= FChain
	numNodes := 4

	p2pKeys := make([]p2pkey.KeyV2, numNodes)
	testP2PIDs := make([][32]byte, numNodes)
	for i := 0; i < numNodes; i++ {
		key, err := p2pkey.NewV2()
		require.NoError(t, err, "failed to generate p2p key")
		p2pKeys[i] = key
		testP2PIDs[i] = key.PeerID()

		for j := 0; j < i; j++ {
			require.NotEqual(t, testP2PIDs[i], testP2PIDs[j], "P2P keys must be unique, but node %d and %d have the same peer ID", i, j)
		}
	}

	// Mock nodes for v1_6 changesets (simulates Job Distributor responses)
	mockNodes := make([]*nodev1.Node, numNodes)
	nodeIDs := make([]string, numNodes)
	for i := range p2pKeys {
		peerIDStr := p2pKeys[i].PeerID().String()
		nodeIDs[i] = peerIDStr
		mockNodes[i] = &nodev1.Node{
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
	env.Offchain = &mockOffchainClient{nodes: mockNodes, tonChainID: tonChainID}
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

	// Alias CapabilitiesRegistry v1.0.0 -> v1.6.0 (SetOCR3Config expects v1.6.0, but DeployHomeChain deploys v1.0.0)
	env = addCapabilitiesRegistryVersionAlias(t, env, evmSelector)

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
	dReg := deployops.GetRegistry()
	_, err = deployops.SetOCR3Config(dReg, mcmsRegistry).Apply(env, deployops.SetOCR3ConfigArgs{
		HomeChainSel:    evmSelector,
		RemoteChainSels: tonChainSelectors,
		ConfigType:      utils.ConfigTypeActive,
	})
	require.NoError(t, err, "Failed to apply SetOCR3Config changeset")
	t.Log("Successfully set OCR3 config on TON offRamp")
}

// mockOffchainClient mocks the Job Distributor for testing v1_6 changesets
type mockOffchainClient struct {
	nodes      []*nodev1.Node
	tonChainID string
}

func (m *mockOffchainClient) ListNodes(ctx context.Context, in *nodev1.ListNodesRequest, opts ...grpc.CallOption) (*nodev1.ListNodesResponse, error) {
	return &nodev1.ListNodesResponse{Nodes: m.nodes}, nil
}

func (m *mockOffchainClient) ListNodeChainConfigs(ctx context.Context, in *nodev1.ListNodeChainConfigsRequest, opts ...grpc.CallOption) (*nodev1.ListNodeChainConfigsResponse, error) {
	var configs []*nodev1.ChainConfig

	requestedNodeIDs := make(map[string]bool)
	if in.Filter != nil {
		for _, id := range in.Filter.NodeIds {
			requestedNodeIDs[id] = true
		}
	}

	for nodeIdx, node := range m.nodes {
		if len(requestedNodeIDs) > 0 && !requestedNodeIDs[node.Id] {
			continue
		}

		var peerIDStr string
		for _, label := range node.Labels {
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

		configs = append(configs, &nodev1.ChainConfig{
			NodeId: node.Id,
			Chain: &nodev1.Chain{
				Id:   "1",
				Type: nodev1.ChainType_CHAIN_TYPE_EVM,
			},
			Ocr2Config: &nodev1.OCR2Config{
				OcrKeyBundle: &nodev1.OCR2Config_OCRKeyBundle{
					BundleId:              fmt.Sprintf("bundle-evm-%s", node.Id),
					OnchainSigningAddress: hex.EncodeToString(ocrKeyBytes[:20]),
					OffchainPublicKey:     hex.EncodeToString(ocrKeyBytes[:32]),
					ConfigPublicKey:       hex.EncodeToString(ocrKeyBytes[:32]),
				},
				P2PKeyBundle: &nodev1.OCR2Config_P2PKeyBundle{
					PeerId: peerIDStr,
				},
			},
			AccountAddress: fmt.Sprintf("0x%s", hex.EncodeToString(ocrKeyBytes[:20])),
		})
		// TON chain config (required by AddDonAndSetCandidateChangeset for TON family OCR setup)
		if m.tonChainID != "" {
			tonAddr := address.NewAddress(0, 0, ocrKeyBytes[:])
			configs = append(configs, &nodev1.ChainConfig{
				NodeId: node.Id,
				Chain: &nodev1.Chain{
					Id:   m.tonChainID,
					Type: nodev1.ChainType_CHAIN_TYPE_TON,
				},
				Ocr2Config: &nodev1.OCR2Config{
					OcrKeyBundle: &nodev1.OCR2Config_OCRKeyBundle{
						BundleId:              fmt.Sprintf("bundle-ton-%s", node.Id),
						OnchainSigningAddress: hex.EncodeToString(ocrKeyBytes[:32]),
						OffchainPublicKey:     hex.EncodeToString(ocrKeyBytes[:32]),
						ConfigPublicKey:       hex.EncodeToString(ocrKeyBytes[:32]),
					},
					P2PKeyBundle: &nodev1.OCR2Config_P2PKeyBundle{
						PeerId: peerIDStr,
					},
				},
				AccountAddress: tonAddr.String(),
			})
		}
	}
	return &nodev1.ListNodeChainConfigsResponse{ChainConfigs: configs}, nil
}

// NodeServiceClient stub methods
func (m *mockOffchainClient) DisableNode(ctx context.Context, in *nodev1.DisableNodeRequest, opts ...grpc.CallOption) (*nodev1.DisableNodeResponse, error) {
	return &nodev1.DisableNodeResponse{}, nil
}

func (m *mockOffchainClient) EnableNode(ctx context.Context, in *nodev1.EnableNodeRequest, opts ...grpc.CallOption) (*nodev1.EnableNodeResponse, error) {
	return &nodev1.EnableNodeResponse{}, nil
}

func (m *mockOffchainClient) GetNode(ctx context.Context, in *nodev1.GetNodeRequest, opts ...grpc.CallOption) (*nodev1.GetNodeResponse, error) {
	for _, node := range m.nodes {
		if node.Id == in.Id {
			return &nodev1.GetNodeResponse{Node: node}, nil
		}
	}
	return nil, fmt.Errorf("node not found: %s", in.Id)
}

func (m *mockOffchainClient) RegisterNode(ctx context.Context, in *nodev1.RegisterNodeRequest, opts ...grpc.CallOption) (*nodev1.RegisterNodeResponse, error) {
	return &nodev1.RegisterNodeResponse{}, nil
}

func (m *mockOffchainClient) UpdateNode(ctx context.Context, in *nodev1.UpdateNodeRequest, opts ...grpc.CallOption) (*nodev1.UpdateNodeResponse, error) {
	return &nodev1.UpdateNodeResponse{}, nil
}

// JobServiceClient stub methods
func (m *mockOffchainClient) GetJob(ctx context.Context, in *jobv1.GetJobRequest, opts ...grpc.CallOption) (*jobv1.GetJobResponse, error) {
	return &jobv1.GetJobResponse{}, nil
}

func (m *mockOffchainClient) GetProposal(ctx context.Context, in *jobv1.GetProposalRequest, opts ...grpc.CallOption) (*jobv1.GetProposalResponse, error) {
	return &jobv1.GetProposalResponse{}, nil
}

func (m *mockOffchainClient) ListJobs(ctx context.Context, in *jobv1.ListJobsRequest, opts ...grpc.CallOption) (*jobv1.ListJobsResponse, error) {
	return &jobv1.ListJobsResponse{}, nil
}

func (m *mockOffchainClient) ListProposals(ctx context.Context, in *jobv1.ListProposalsRequest, opts ...grpc.CallOption) (*jobv1.ListProposalsResponse, error) {
	return &jobv1.ListProposalsResponse{}, nil
}

func (m *mockOffchainClient) ProposeJob(ctx context.Context, in *jobv1.ProposeJobRequest, opts ...grpc.CallOption) (*jobv1.ProposeJobResponse, error) {
	return &jobv1.ProposeJobResponse{}, nil
}

func (m *mockOffchainClient) BatchProposeJob(ctx context.Context, in *jobv1.BatchProposeJobRequest, opts ...grpc.CallOption) (*jobv1.BatchProposeJobResponse, error) {
	return &jobv1.BatchProposeJobResponse{}, nil
}

func (m *mockOffchainClient) RevokeJob(ctx context.Context, in *jobv1.RevokeJobRequest, opts ...grpc.CallOption) (*jobv1.RevokeJobResponse, error) {
	return &jobv1.RevokeJobResponse{}, nil
}

func (m *mockOffchainClient) DeleteJob(ctx context.Context, in *jobv1.DeleteJobRequest, opts ...grpc.CallOption) (*jobv1.DeleteJobResponse, error) {
	return &jobv1.DeleteJobResponse{}, nil
}

func (m *mockOffchainClient) UpdateJob(ctx context.Context, in *jobv1.UpdateJobRequest, opts ...grpc.CallOption) (*jobv1.UpdateJobResponse, error) {
	return &jobv1.UpdateJobResponse{}, nil
}

// CSAServiceClient stub methods
func (m *mockOffchainClient) GetKeypair(ctx context.Context, in *csav1.GetKeypairRequest, opts ...grpc.CallOption) (*csav1.GetKeypairResponse, error) {
	return &csav1.GetKeypairResponse{}, nil
}

func (m *mockOffchainClient) ListKeypairs(ctx context.Context, in *csav1.ListKeypairsRequest, opts ...grpc.CallOption) (*csav1.ListKeypairsResponse, error) {
	return &csav1.ListKeypairsResponse{}, nil
}

// addCapabilitiesRegistryVersionAlias creates a v1.6.0 alias for the v1.0.0 CapabilitiesRegistry
// (DeployHomeChain deploys v1.0.0, but SetOCR3Config expects v1.6.0)
func addCapabilitiesRegistryVersionAlias(t *testing.T, env cldf.Environment, chainSelector uint64) cldf.Environment {
	existingAddrs, err := env.DataStore.Addresses().Fetch()
	require.NoError(t, err, "failed to fetch addresses from datastore")

	var capRegAddr string
	for _, addr := range existingAddrs {
		if addr.ChainSelector == chainSelector &&
			addr.Type == datastore.ContractType(utils.CapabilitiesRegistry) &&
			addr.Version != nil && addr.Version.String() == "1.0.0" {
			capRegAddr = addr.Address
			break
		}
	}
	require.NotEmpty(t, capRegAddr, "CapabilitiesRegistry address not found in datastore")

	newDS := datastore.NewMemoryDataStore()
	for _, addr := range existingAddrs {
		err := newDS.Addresses().Add(addr)
		require.NoError(t, err, "failed to add address to new datastore")
	}

	version160 := semver.MustParse("1.6.0")
	err = newDS.Addresses().Add(datastore.AddressRef{
		ChainSelector: chainSelector,
		Address:       capRegAddr,
		Type:          datastore.ContractType(utils.CapabilitiesRegistry),
		Version:       version160,
		Qualifier:     fmt.Sprintf("%s-%s-v1.6.0", capRegAddr, utils.CapabilitiesRegistry),
	})
	require.NoError(t, err, "failed to add CapabilitiesRegistry version alias")

	env.DataStore = newDS.Seal()
	return env
}
