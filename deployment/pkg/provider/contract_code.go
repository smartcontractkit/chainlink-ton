package provider

import (
	"context"
	"fmt"
	"sync"

	"github.com/smartcontractkit/chainlink-deployments-framework/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

type contractProvider struct {
	logger            logger.Logger
	mu                sync.RWMutex
	compiledContracts map[string]ton.CompiledContract
}

func (c *contractProvider) GetContract(ctx context.Context, meta ton.ContractMetadata) (ton.CompiledContract, error) {
	key := meta.Key()

	// Check if the contract is already cached
	c.mu.RLock()
	contract, ok := c.compiledContracts[key]
	c.mu.RUnlock()
	if ok {
		return contract, nil
	}
	// If it wasn't cached acquire write lock and continue fetching
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check again in case another goroutine populated it
	contract, ok = c.compiledContracts[key]
	if ok {
		return contract, nil
	}

	// Fetch compiled contracts for the package and cache them
	input := utils.RetrieveCompiledContractsOpts{
		Package: meta.Package,
	}
	compiledContracts, err := utils.RetrieveCompiledTONContracts(ctx, c.logger, &input)
	if err != nil {
		return ton.CompiledContract{}, fmt.Errorf("failed to retrieve compiled TON contract: %w", err)
	}

	for _, compiledContract := range compiledContracts {
		c.compiledContracts[compiledContract.Metadata.Key()] = compiledContract
	}

	contract, ok = c.compiledContracts[key]
	if !ok {
		return ton.CompiledContract{}, fmt.Errorf("contract not found after retrieval: %s", key)
	}

	return contract, nil
}

func NewCCIPContractProvider(logger logger.Logger) (ton.ContractCodeProvider, error) {
	return &contractProvider{
		logger:            logger,
		compiledContracts: make(map[string]ton.CompiledContract),
	}, nil
}
