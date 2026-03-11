package provider_test

import (
	"context"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/provider"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

// allMappedContractTypes lists every contract type present in the contractsMapping
// used by RetrieveCompiledTONContracts. Keeping them here lets us verify the
// provider exposes every expected contract.
var allMappedContractTypes = []struct {
	Name string
	Type string // ds.ContractType is a string typedef
}{
	{"Router", string(state.Router)},
	{"FeeQuoter", string(state.FeeQuoter)},
	{"OnRamp", string(state.OnRamp)},
	{"OffRamp", string(state.OffRamp)},
	{"SendExecutor", string(state.SendExecutor)},
	{"Deployer", string(state.Deployer)},
	{"MerkleRoot", string(state.MerkleRoot)},
	{"ReceiveExecutor", string(state.ReceiveExecutor)},
	{"TonReceiver", string(state.TonReceiver)},
	{"Timelock", string(state.Timelock)},
	{"MCMS", string(state.MCMS)},
}

func TestNewCCIPContractProvider_Local(t *testing.T) {
	// Use "local" to skip the HTTP download and read from contracts/build/
	// in the repository root (resolved via git rev-parse).
	ctx := context.Background()
	lggr, err := logger.New()
	require.NoError(t, err)

	codeProvider, err := provider.NewCCIPContractProvider(ctx, lggr, utils.ContractsVersionLocal)
	require.NoError(t, err)
	require.NotNil(t, codeProvider)

	defaultVersion := semver.MustParse("1.6.0")

	for _, ct := range allMappedContractTypes {
		t.Run(ct.Name, func(t *testing.T) {
			meta := opston.ContractMetadata{
				Package: "github.com/smartcontractkit/chainlink-ton",
				Version: defaultVersion,
				ID:      ct.Type,
			}

			compiled, err := codeProvider.GetContract(meta)
			require.NoError(t, err, "GetContract should succeed for %s", ct.Name)
			assert.NotNil(t, compiled.Code, "Code cell should not be nil for %s", ct.Name)
			assert.Equal(t, meta.Key(), compiled.Metadata.Key(), "Metadata key should match for %s", ct.Name)
			assert.Equal(t, ct.Type, compiled.Metadata.ID, "Metadata ID should match the contract type")
		})
	}
}

func TestContractProvider_GetContract_NotFound(t *testing.T) {
	ctx := context.Background()
	lggr, err := logger.New()
	require.NoError(t, err)

	codeProvider, err := provider.NewCCIPContractProvider(ctx, lggr, utils.ContractsVersionLocal)
	require.NoError(t, err)

	meta := opston.ContractMetadata{
		Package: "github.com/smartcontractkit/chainlink-ton",
		Version: semver.MustParse("1.6.0"),
		ID:      "NonExistentContract",
	}

	_, err = codeProvider.GetContract(meta)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "contract not found for metadata")
}
