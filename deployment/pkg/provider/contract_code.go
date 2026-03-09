package provider

import (
	"context"
	"fmt"

	"github.com/Masterminds/semver/v3"

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

func NewCCIPContractProvider(ctx context.Context, logger logger.Logger, contractsVersionSha string) (ton.ContractCodeProvider, error) {
	input := utils.RetrieveCompiledContractsInput{
		ContractsVersionSha: contractsVersionSha,
	}
	output, err := utils.RetrieveCompiledTONContracts(ctx, logger, input)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve compiled TON contract: %w", err)
	}

	// Convert from map[ds.ContractType]CompiledContractData to map[string]ton.CompiledContract
	compiledContracts := make(map[string]ton.CompiledContract, len(output.CompiledContracts))

	// Default version for now; parse once and reuse for all contracts
	version := semver.MustParse("1.6.0")

	for contractType, data := range output.CompiledContracts {
		// Create ton.ContractMetadata
		metadata := ton.ContractMetadata{
			Package: "github.com/smartcontractkit/chainlink-ton",
			Version: version,
			ID:      string(contractType), // Use the contract type as the ID
		}

		// Create ton.CompiledContract
		contract := ton.CompiledContract{
			Metadata: metadata,
			Code:     data.Code,
		}

		// Store using the metadata key
		compiledContracts[metadata.Key()] = contract
	}

	return &contractProvider{
		compiledContracts: compiledContracts,
	}, nil
}
