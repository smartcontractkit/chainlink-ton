package provider_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/provider"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
)

// allKnownContractFQNs lists every FQN present in the default package metadata,
// used to verify the provider exposes every expected contract.
var allKnownContractFQNs = []struct {
	Name string
	FQN  string
}{
	{"Router", bindings.TypeRouter},
	{"FeeQuoter", bindings.TypeFeeQuoter},
	{"OnRamp", bindings.TypeOnRamp},
	{"OffRamp", bindings.TypeOffRamp},
	{"SendExecutor", bindings.TypeSendExecutor},
	{"Deployable", bindings.TypeDeployable},
	{"MerkleRoot", bindings.TypeMerkleRoot},
	{"ReceiveExecutor", bindings.TypeReceiveExecutor},
	{"TestReceiver", bindings.TypeTestReceiver},
	{"Timelock", bindings.TypeTimelock},
	{"MCMS", bindings.TypeMCMS},
}

func TestNewCCIPContractProvider_Local(t *testing.T) {
	// Use "local" to skip the HTTP download and read from contracts/build/
	// in the repository root (resolved via git rev-parse).
	ctx := context.Background()

	codeProvider, err := provider.NewCCIPContractProvider()
	require.NoError(t, err)
	require.NotNil(t, codeProvider)

	for _, ct := range allKnownContractFQNs {
		t.Run(ct.Name, func(t *testing.T) {
			meta := opston.ContractMetadata{
				Package: utils.ContractsVersionLocal,
				ID:      ct.FQN,
			}

			compiled, err := codeProvider.GetContract(ctx, meta)
			require.NoError(t, err, "GetContract should succeed for %s", ct.Name)
			assert.NotNil(t, compiled.Code, "Code cell should not be nil for %s", ct.Name)
			assert.Equal(t, meta.Key(), compiled.Metadata.Key(), "Metadata key should match for %s", ct.Name)
			assert.Equal(t, ct.FQN, compiled.Metadata.ID, "Metadata ID should match the FQN for %s", ct.Name)
		})
	}
}

func TestContractProvider_GetContract_NotFound(t *testing.T) {
	ctx := context.Background()

	codeProvider, err := provider.NewCCIPContractProvider()
	require.NoError(t, err)

	meta := opston.ContractMetadata{
		Package: utils.ContractsVersionLocal,
		ID:      "NonExistentContract",
	}

	_, err = codeProvider.GetContract(ctx, meta)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "contract not found after retrieval")
}
