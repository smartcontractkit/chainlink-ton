package provider

import (
	"context"
	"fmt"

	"github.com/smartcontractkit/chainlink-deployments-framework/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

type contractProvider struct {
	logger logger.Logger;
	compiledContracts map[string]ton.CompiledContract;
}

func (c *contractProvider) GetContract(ctx context.Context, meta ton.ContractMetadata) (ton.CompiledContract, error) {
	contract, ok := c.compiledContracts[meta.Key()]
	if !ok {
		// If not found in cache, retrieve all compiled contracts for the package and populate the cache.
		input := utils.RetrieveCompiledContractsInput{
			Package: meta.Package,
		}
		output, err := utils.RetrieveCompiledTONContracts(ctx, c.logger, input)
		if err != nil {
			return ton.CompiledContract{}, fmt.Errorf("failed to retrieve compiled TON contract: %w", err)
		}
		for _, data := range output.CompiledContracts {
			metadata := ton.ContractMetadata{
				Package: data.PackageRef,
				ID:      data.Type, // FQN, e.g. bindings.TypeRouter
			}
			c.compiledContracts[metadata.Key()] = ton.CompiledContract{
				Metadata: metadata,
				Code:     data.Code,
				Version:  data.Version,
			}
		}
	}
	contract, ok = c.compiledContracts[meta.Key()]
	if !ok {
		return ton.CompiledContract{}, fmt.Errorf("contract not found after retrieval: %s", meta.Key())
	}
	return contract, nil
}

func NewCCIPContractProvider() (ton.ContractCodeProvider, error) {
	logger, err := logger.New()
	if err != nil {
		return nil, fmt.Errorf("failed to create logger: %w", err)
	}
	return &contractProvider{
		logger: logger,
		compiledContracts: make(map[string]ton.CompiledContract),
	}, nil
}
