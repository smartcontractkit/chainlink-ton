package provider

import (
	"context"
	"fmt"
	"sync"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-deployments-framework/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

// contractCodeProvider lazily fetches and caches compiled contracts by ContractRef.
// No contracts are downloaded at construction time; fetching happens on the first
// GetContract call for each unique ContractRef.
type contractCodeProvider struct {
	ctx  context.Context
	lggr logger.Logger

	mu    sync.RWMutex
	cache map[string]map[string]ton.CompiledContract // ref -> contractID -> CompiledContract
}

// NewContractCodeProvider creates a ContractCodeProvider that lazily fetches contracts on first use.
// Contracts are fetched based on the ContractRef field in the metadata passed to GetContract.
// Each unique ContractRef is fetched and cached independently.
func NewContractCodeProvider(ctx context.Context, lggr logger.Logger) ton.ContractCodeProvider {
	return &contractCodeProvider{
		ctx:   ctx,
		lggr:  lggr,
		cache: make(map[string]map[string]ton.CompiledContract),
	}
}

// NewLazyContractCodeProvider is a compatibility alias for NewContractCodeProvider.
//
// Deprecated: use NewContractCodeProvider instead.
func NewLazyContractCodeProvider(ctx context.Context, lggr logger.Logger) ton.ContractCodeProvider {
	return NewContractCodeProvider(ctx, lggr)
}

func (p *contractCodeProvider) GetContract(meta ton.ContractMetadata) (ton.CompiledContract, error) {
	if meta.ContractRef == "" {
		return ton.CompiledContract{}, fmt.Errorf("ContractRef is required in metadata but was empty (contract ID: %s)", meta.ID)
	}

	// Fast path: check read-locked cache
	p.mu.RLock()
	if contracts, ok := p.cache[meta.ContractRef]; ok {
		p.mu.RUnlock()
		contract, ok := contracts[meta.ID]
		if !ok {
			return ton.CompiledContract{}, fmt.Errorf("contract not found for ID: %s (ref: %s)", meta.ID, meta.ContractRef)
		}
		return contract, nil
	}
	p.mu.RUnlock()

	// Slow path: fetch and cache
	p.mu.Lock()
	defer p.mu.Unlock()

	// Double-check after acquiring write lock
	if contracts, ok := p.cache[meta.ContractRef]; ok {
		contract, ok := contracts[meta.ID]
		if !ok {
			return ton.CompiledContract{}, fmt.Errorf("contract not found for ID: %s (ref: %s)", meta.ID, meta.ContractRef)
		}
		return contract, nil
	}

	contracts, err := fetchCompiledContracts(p.ctx, p.lggr, meta.ContractRef)
	if err != nil {
		return ton.CompiledContract{}, fmt.Errorf("failed to fetch contracts for ref %q: %w", meta.ContractRef, err)
	}
	p.cache[meta.ContractRef] = contracts

	contract, ok := contracts[meta.ID]
	if !ok {
		return ton.CompiledContract{}, fmt.Errorf("contract not found for ID: %s (ref: %s)", meta.ID, meta.ContractRef)
	}
	return contract, nil
}

// fetchCompiledContracts downloads and parses all compiled contracts for the given ref.
func fetchCompiledContracts(ctx context.Context, lggr logger.Logger, ref string) (map[string]ton.CompiledContract, error) {
	src, err := utils.ParseContractsRef(ref)
	if err != nil {
		return nil, fmt.Errorf("invalid contracts ref: %w", err)
	}

	output, err := utils.RetrieveCompiledTONContracts(ctx, lggr, utils.RetrieveCompiledContractsInput{
		ContractsVersionSha: ref,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve compiled TON contracts: %w", err)
	}

	var metaVersion *semver.Version
	switch src.Kind {
	case utils.ContractsSourceKindGithubSemver:
		metaVersion = semver.MustParse(src.Version)
	default:
		metaVersion = semver.MustParse("0.0.0")
	}

	compiled := make(map[string]ton.CompiledContract, len(output.CompiledContracts))
	for contractType, data := range output.CompiledContracts {
		metadata := ton.ContractMetadata{
			Package:     "github.com/smartcontractkit/chainlink-ton",
			Version:     metaVersion,
			ContractRef: ref,
			ID:          string(contractType),
		}
		compiled[metadata.ID] = ton.CompiledContract{
			Metadata:  metadata,
			Code:      data.Code,
			SourceRef: ref,
		}
	}

	return compiled, nil
}
