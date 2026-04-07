package provider_test

import (
	"context"
	"testing"

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

func TestNewContractCodeProvider_Local(t *testing.T) {
	// Use "local" to skip the HTTP download and read from contracts/build/
	// in the repository root (resolved via git rev-parse).
	ctx := context.Background()
	lggr, err := logger.New()
	require.NoError(t, err)

	codeProvider := provider.NewContractCodeProvider(ctx, lggr)
	require.NotNil(t, codeProvider)

	for _, ct := range allMappedContractTypes {
		t.Run(ct.Name, func(t *testing.T) {
			meta := opston.ContractMetadata{
				ID:          ct.Type,
				ContractRef: utils.ContractsVersionLocal,
			}

			compiled, err := codeProvider.GetContract(meta)
			require.NoError(t, err, "GetContract should succeed for %s", ct.Name)
			assert.NotNil(t, compiled.Code, "Code cell should not be nil for %s", ct.Name)
			assert.Equal(t, ct.Type, compiled.Metadata.ID, "Metadata ID should match the contract type for %s", ct.Name)
			assert.Equal(t, utils.ContractsVersionLocal, compiled.SourceRef, "SourceRef should match the input ref")
		})
	}
}

func TestContractProvider_GetContract_NotFound(t *testing.T) {
	ctx := context.Background()
	lggr, err := logger.New()
	require.NoError(t, err)

	codeProvider := provider.NewContractCodeProvider(ctx, lggr)

	meta := opston.ContractMetadata{
		ID:          "NonExistentContract",
		ContractRef: utils.ContractsVersionLocal,
	}

	_, err = codeProvider.GetContract(meta)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "contract not found for ID")
}

func TestContractProvider_FetchesOnFirstUse(t *testing.T) {
	ctx := context.Background()
	lggr, err := logger.New()
	require.NoError(t, err)

	codeProvider := provider.NewContractCodeProvider(ctx, lggr)

	// First call should trigger fetch
	meta := opston.ContractMetadata{
		ID:          string(state.Router),
		ContractRef: utils.ContractsVersionLocal,
	}
	compiled, err := codeProvider.GetContract(meta)
	require.NoError(t, err)
	assert.Equal(t, string(state.Router), compiled.Metadata.ID)
	assert.Equal(t, utils.ContractsVersionLocal, compiled.Metadata.ContractRef)

	// Second call should use cached provider
	compiled2, err := codeProvider.GetContract(meta)
	require.NoError(t, err)
	assert.Equal(t, compiled.Metadata.ID, compiled2.Metadata.ID)
}

func TestContractProvider_EmptyRef(t *testing.T) {
	ctx := context.Background()
	lggr, err := logger.New()
	require.NoError(t, err)

	codeProvider := provider.NewContractCodeProvider(ctx, lggr)

	// Attempting to get a contract without ContractRef in metadata should fail with a clear error
	meta := opston.ContractMetadata{ID: string(state.Router)}
	_, err = codeProvider.GetContract(meta)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ContractRef is required")
	assert.Contains(t, err.Error(), string(state.Router))
}

func TestContractProvider_MultipleRefs(t *testing.T) {
	ctx := context.Background()
	lggr, err := logger.New()
	require.NoError(t, err)

	codeProvider := provider.NewContractCodeProvider(ctx, lggr)

	// Fetch contract with first ref
	meta1 := opston.ContractMetadata{
		ID:          string(state.Router),
		ContractRef: utils.ContractsVersionLocal,
	}
	compiled1, err := codeProvider.GetContract(meta1)
	require.NoError(t, err)
	assert.Equal(t, utils.ContractsVersionLocal, compiled1.Metadata.ContractRef)

	// Fetch same contract type but with different ref (this demonstrates caching by ref)
	// Note: we can't actually test with a different valid ref easily here,
	// so we just validate that the same ref works repeatedly
	compiled2, err := codeProvider.GetContract(meta1)
	require.NoError(t, err)
	assert.Equal(t, compiled1.Metadata.ID, compiled2.Metadata.ID)
}
