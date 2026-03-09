package ccip

import (
	"context"
	"fmt"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	chainselectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldfchain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opsupgrade "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/lib/versioning/upgradeable"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/versioning/upgradeable"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	ownable2step "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

// upgradeableCounterV1Data matches the V1 data layout:
//
//	id:uint32 | value:uint32 | ownable2step.Storage(owner:addr, pendingOwner:addr)
type upgradeableCounterV1Data struct {
	ID      uint32               `tlb:"## 32"`
	Value   uint32               `tlb:"## 32"`
	Ownable ownable2step.Storage `tlb:"."`
}

// mockContractCodeProvider is a test ContractCodeProvider that serves
// pre-loaded compiled contracts keyed by ContractMetadata.Key().
type mockContractCodeProvider struct {
	contracts map[string]opston.CompiledContract
}

func (m *mockContractCodeProvider) GetContract(meta opston.ContractMetadata) (opston.CompiledContract, error) {
	key := meta.Key()
	c, ok := m.contracts[key]
	if !ok {
		return opston.CompiledContract{}, fmt.Errorf("contract not found for metadata: %s", key)
	}
	return c, nil
}

// newUpgradeableCounterProvider builds a ContractCodeProvider that knows about
// UpgradeableCounterV1 and V2 loaded from the local build directory.
func newUpgradeableCounterProvider(ctx context.Context) (*mockContractCodeProvider, opston.ContractMetadata, opston.ContractMetadata, error) {
	buildDir := helpers.GetBuildsDir(ctx)

	codeV1, err := wrappers.ParseCompiledContract(buildDir + "/examples.versioning.upgrades.UpgradeableCounterV1.compiled.json")
	if err != nil {
		return nil, opston.ContractMetadata{}, opston.ContractMetadata{}, fmt.Errorf("failed to parse V1: %w", err)
	}

	codeV2, err := wrappers.ParseCompiledContract(buildDir + "/examples.versioning.upgrades.UpgradeableCounterV2.compiled.json")
	if err != nil {
		return nil, opston.ContractMetadata{}, opston.ContractMetadata{}, fmt.Errorf("failed to parse V2: %w", err)
	}

	metaV1 := opston.ContractMetadata{
		Package: "github.com/smartcontractkit/chainlink-ton",
		Version: semver.MustParse("1.0.0"),
		ID:      "examples.versioning.upgrades.UpgradeableCounterV1",
	}

	metaV2 := opston.ContractMetadata{
		Package: "github.com/smartcontractkit/chainlink-ton",
		Version: semver.MustParse("2.0.0"),
		ID:      "examples.versioning.upgrades.UpgradeableCounterV2",
	}

	provider := &mockContractCodeProvider{
		contracts: map[string]opston.CompiledContract{
			metaV1.Key(): {Metadata: metaV1, Code: codeV1},
			metaV2.Key(): {Metadata: metaV2, Code: codeV2},
		},
	}

	return provider, metaV1, metaV2, nil
}

func TestUpgradeOperation(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)
	ctx := t.Context()

	// ----- Environment -----
	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().Build(t)
	require.NoError(t, err)

	tonSelector := env.BlockChains.ListChainSelectors(cldfchain.WithFamily(chainselectors.FamilyTon))[0]
	tonChain := env.BlockChains.TonChains()[tonSelector]

	// ----- Load contracts -----
	contractProvider, metaV1, metaV2, err := newUpgradeableCounterProvider(ctx)
	require.NoError(t, err)

	cV1, err := contractProvider.GetContract(metaV1)
	require.NoError(t, err)
	cV2, err := contractProvider.GetContract(metaV2)
	require.NoError(t, err)
	require.NotEqual(t, cV1.Code.Hash(), cV2.Code.Hash(), "V1 and V2 code hashes should differ")

	// ----- Build initial data cell (V1 layout) -----
	ownerAddr := tonChain.WalletAddress
	initData := upgradeableCounterV1Data{
		ID:    0,
		Value: 42,
		Ownable: ownable2step.Storage{
			Owner:        ownerAddr,
			PendingOwner: nil,
		},
	}
	dataCell, err := tlb.ToCell(initData)
	require.NoError(t, err)

	// ----- Deploy V1 using wrappers.Deploy -----
	client := tracetracking.NewSignedAPIClient(tonChain.Client, *tonChain.Wallet)
	contract, deployMsg, err := wrappers.Deploy(ctx, &client, cV1.Code, dataCell, tlb.MustFromTON("0.1"), tvm.EmptyCell)
	require.NoError(t, err, "Deploy V1 should succeed")

	deployExitCode, err := deployMsg.OutgoingInternalReceivedMessages[0].ExitCode()
	require.NoError(t, err)
	require.Equal(t, tvm.ExitCodeSuccess, deployExitCode, "V1 deploy should succeed with exit code 0")
	t.Logf("Deployed UpgradeableCounterV1 at %s", contract.Address.String())

	// ----- Verify V1 state on chain -----
	block, err := tonChain.Client.CurrentMasterchainInfo(ctx)
	require.NoError(t, err)

	acc, err := tonChain.Client.GetAccount(ctx, block, contract.Address)
	require.NoError(t, err)
	require.True(t, acc.IsActive, "Contract should be active after deploy")
	require.Equal(t, cV1.Code.Hash(), acc.Code.Hash(), "On-chain code should match V1")

	tv, err := tvm.CallGetter(ctx, tonChain.Client, block, contract.Address, common.GetTypeAndVersion)
	require.NoError(t, err)
	require.Equal(t, "link.chain.ton.examples.versioning.upgrades.UpgradeableCounter", tv.Type)
	require.Equal(t, "1.0.0", tv.Version)
	t.Logf("V1 TypeAndVersion: %s %s", tv.Type, tv.Version)

	valueV1, err := wrappers.Uint32From(
		tonChain.Client.WaitForBlock(block.SeqNo).RunGetMethod(ctx, block, contract.Address, "value"),
	)
	require.NoError(t, err)
	require.Equal(t, uint32(42), valueV1, "Initial value should be 42")

	// ----- Upgrade to V2 using the Upgrade operation -----
	dp, err := dep.NewDependencyProvider(
		dep.Provide(tonChain),
		dep.ProvideAs[*mockContractCodeProvider, opston.ContractCodeProvider](contractProvider),
	)
	require.NoError(t, err)

	rptr := operations.NewMemoryReporter()
	b := operations.NewBundle(func() context.Context { return ctx }, lggr, rptr)

	upgradeResult, err := operations.ExecuteOperation(b, opsupgrade.Upgrade, dp, opsupgrade.UpgradeInput{
		Messages: []opsupgrade.UpgradeMessage{
			{
				ContractMeta: metaV2,
				Message: opston.InternalMessage[upgradeable.Upgrade]{
					Bounce:  true,
					DstAddr: contract.Address,
					Amount:  tlb.MustFromTON("0.05"),
					Body:    nil, // auto-creates upgradeable.Upgrade message with V2 code
				},
			},
		},
		Plan: false,
	})
	require.NoError(t, err, "Upgrade to V2 should succeed")
	require.NotNil(t, upgradeResult.Output.Transaction, "Upgrade should produce a transaction")

	// ----- Verify V2 state on chain -----
	block, err = tonChain.Client.CurrentMasterchainInfo(ctx)
	require.NoError(t, err)

	tv, err = tvm.CallGetter(ctx, tonChain.Client, block, contract.Address, common.GetTypeAndVersion)
	require.NoError(t, err)
	require.Equal(t, "link.chain.ton.examples.versioning.upgrades.UpgradeableCounter", tv.Type)
	require.Equal(t, "2.0.0", tv.Version, "Version should be 2.0.0 after upgrade")
	t.Logf("V2 TypeAndVersion: %s %s", tv.Type, tv.Version)

	// Verify on-chain code matches V2
	acc, err = tonChain.Client.GetAccount(ctx, block, contract.Address)
	require.NoError(t, err)
	require.Equal(t, cV2.Code.Hash(), acc.Code.Hash(), "On-chain code should match V2 code after upgrade")
}
