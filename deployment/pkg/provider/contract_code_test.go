package provider_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/provider"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
)

func TestNewCCIPContractProvider_Local(t *testing.T) {
	// Use "local" to skip the HTTP download and read from contracts/build/
	// in the repository root (resolved via git rev-parse).
	ctx := context.Background()

	lggr, err := logger.New()
	require.NoError(t, err)
	codeProvider, err := provider.NewCCIPContractProvider(lggr)
	require.NoError(t, err)
	require.NotNil(t, codeProvider)

	for _, ct := range bindings.AllContractTypes {
		t.Run(ct.SimpleName, func(t *testing.T) {
			meta := opston.ContractMetadata{
				Package: utils.ContractsVersionLocal,
				ID:      ct.ContractType,
			}

			compiled, err := codeProvider.GetContract(ctx, meta)
			require.NoError(t, err, "GetContract should succeed for %s", ct.SimpleName)
			assert.NotNil(t, compiled.Code, "Code cell should not be nil for %s", ct.SimpleName)
			assert.Equal(t, meta.Key(), compiled.Metadata.Key(), "Metadata key should match for %s", ct.SimpleName)
			assert.Equal(t, ct.ContractType, compiled.Metadata.ID, "Metadata ID should match the fully qualified name for %s", ct.SimpleName)
		})
	}
}

func TestContractProvider_GetContract_NotFound(t *testing.T) {
	ctx := context.Background()

	lggr, err := logger.New()
	require.NoError(t, err)
	codeProvider, err := provider.NewCCIPContractProvider(lggr)
	require.NoError(t, err)

	meta := opston.ContractMetadata{
		Package: utils.ContractsVersionLocal,
		ID:      "NonExistentContract",
	}

	_, err = codeProvider.GetContract(ctx, meta)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "contract not found after retrieval")
}
