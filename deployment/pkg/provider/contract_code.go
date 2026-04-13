package provider

import (
	"context"
	"fmt"

	"github.com/smartcontractkit/chainlink-deployments-framework/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

type contractProvider struct {
	compiledContracts map[string]ton.CompiledContract
}

func (c *contractProvider) GetContract(meta ton.ContractMetadata) (ton.CompiledContract, error) {
	key := meta.Key()
	contract, ok := c.compiledContracts[key]
	if !ok {
		return ton.CompiledContract{}, fmt.Errorf("contract not found for metadata: %s", key)
	}
	return contract, nil
}

func NewCCIPContractProvider(ctx context.Context, logger logger.Logger, contractsPackage string) (ton.ContractCodeProvider, error) {
	input := utils.RetrieveCompiledContractsInput{
		Package: contractsPackage,
	}
	output, err := utils.RetrieveCompiledTONContracts(ctx, logger, input)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve compiled TON contract: %w", err)
	}

	// Convert from map[string]CompiledContractData (keyed by FQN) to map[string]ton.CompiledContract.
	// The FQN is used directly as the ContractMetadata.ID so that callers can look up contracts
	// using bindings.TypeXxx constants.
	// TODO: Unify ContractMetadata.ID to use FQN everywhere once deployment/state short-name
	// ds.ContractType constants are removed.
	compiledContracts := make(map[string]ton.CompiledContract, len(output.CompiledContracts))

	for _, data := range output.CompiledContracts {
		metadata := ton.ContractMetadata{
			Package: "github.com/smartcontractkit/chainlink-ton",
			Version: data.Version,
			ID:      data.Type, // FQN, e.g. bindings.TypeRouter
		}
		compiledContracts[metadata.Key()] = ton.CompiledContract{
			Metadata: metadata,
			Code:     data.Code,
		}
	}

	return &contractProvider{
		compiledContracts: compiledContracts,
	}, nil
}
