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

type contractProvider struct {
	ref string // The contracts ref this provider was created with
	// compiledContracts is keyed by ContractMetadata.ID (e.g. "Router", "FeeQuoter").
	compiledContracts map[string]ton.CompiledContract
}

func (c *contractProvider) GetContract(meta ton.ContractMetadata) (ton.CompiledContract, error) {
	// For non-lazy providers created with a specific ref, meta.ContractRef is optional.
	// If provided, it should match the provider's ref (for validation).
	// If not provided, we'll use the provider's ref automatically.
	requestedRef := meta.ContractRef
	if requestedRef == "" {
		requestedRef = c.ref
	} else if requestedRef != c.ref {
		return ton.CompiledContract{}, fmt.Errorf("contract ref mismatch: provider has %q but metadata requested %q", c.ref, requestedRef)
	}

	contract, ok := c.compiledContracts[meta.ID]
	if !ok {
		return ton.CompiledContract{}, fmt.Errorf("contract not found for ID: %s (ref: %s)", meta.ID, requestedRef)
	}
	return contract, nil
}

// NewContractCodeProvider creates a ContractCodeProvider from a contracts ref string.
// The ref format is documented in utils.ParseContractsRef.
func NewContractCodeProvider(ctx context.Context, lggr logger.Logger, ref string) (ton.ContractCodeProvider, error) {
	// Validate the ref before doing any I/O.
	src, err := utils.ParseContractsRef(ref)
	if err != nil {
		return nil, fmt.Errorf("invalid contracts ref: %w", err)
	}

	input := utils.RetrieveCompiledContractsInput{
		ContractsVersionSha: ref,
	}
	output, err := utils.RetrieveCompiledTONContracts(ctx, lggr, input)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve compiled TON contracts: %w", err)
	}

	// Derive the semver version for metadata:
	// - semver refs  → use the parsed version
	// - everything else → use a "0.0.0-<ref>" prerelease so Key() stays deterministic
	var metaVersion *semver.Version
	switch src.Kind {
	case utils.ContractsSourceKindGithubSemver:
		metaVersion = semver.MustParse(src.Version)
	default:
		// Non-semver ref; version is informational only (lookup is by ID).
		metaVersion = semver.MustParse("0.0.0")
	}

	compiledContracts := make(map[string]ton.CompiledContract, len(output.CompiledContracts))
	for contractType, data := range output.CompiledContracts {
		metadata := ton.ContractMetadata{
			Package:     "github.com/smartcontractkit/chainlink-ton",
			Version:     metaVersion,
			ContractRef: ref,
			ID:          string(contractType),
		}
		compiledContracts[metadata.ID] = ton.CompiledContract{
			Metadata:  metadata,
			Code:      data.Code,
			SourceRef: ref,
		}
	}

	return &contractProvider{
		ref:               ref,
		compiledContracts: compiledContracts,
	}, nil
}

// NewCCIPContractProvider is a compatibility alias for NewContractCodeProvider.
//
// Deprecated: use NewContractCodeProvider instead.
func NewCCIPContractProvider(ctx context.Context, lggr logger.Logger, contractsVersionSha string) (ton.ContractCodeProvider, error) {
	return NewContractCodeProvider(ctx, lggr, contractsVersionSha)
}

// lazyContractProvider defers contract fetching until the first GetContract call.
// It caches providers by ContractRef, so contracts from different refs can coexist.
// This allows operations that don't need compiled contracts to avoid unnecessary downloads.
type lazyContractProvider struct {
	ctx  context.Context
	lggr logger.Logger

	mu        sync.RWMutex
	providers map[string]ton.ContractCodeProvider // keyed by ContractRef
}

// NewLazyContractCodeProvider creates a provider that lazily fetches contracts on first use.
// Contracts are fetched based on the ContractRef field in the metadata passed to GetContract.
// Each unique ContractRef is fetched and cached independently.
func NewLazyContractCodeProvider(ctx context.Context, lggr logger.Logger) ton.ContractCodeProvider {
	return &lazyContractProvider{
		ctx:       ctx,
		lggr:      lggr,
		providers: make(map[string]ton.ContractCodeProvider),
	}
}

func (p *lazyContractProvider) GetContract(meta ton.ContractMetadata) (ton.CompiledContract, error) {
	if meta.ContractRef == "" {
		return ton.CompiledContract{}, fmt.Errorf("ContractRef is required in metadata but was empty (contract ID: %s)", meta.ID)
	}

	// Check if we already have a provider for this ref
	p.mu.RLock()
	provider, exists := p.providers[meta.ContractRef]
	p.mu.RUnlock()

	if exists {
		return provider.GetContract(meta)
	}

	// Need to create a new provider for this ref
	p.mu.Lock()
	defer p.mu.Unlock()

	// Double-check in case another goroutine created it while we waited for the lock
	if provider, exists = p.providers[meta.ContractRef]; exists {
		return provider.GetContract(meta)
	}

	// Create the provider for this specific ref
	newProvider, err := NewContractCodeProvider(p.ctx, p.lggr, meta.ContractRef)
	if err != nil {
		return ton.CompiledContract{}, fmt.Errorf("failed to create contract provider for ref %q: %w", meta.ContractRef, err)
	}

	p.providers[meta.ContractRef] = newProvider
	return newProvider.GetContract(meta)
}

