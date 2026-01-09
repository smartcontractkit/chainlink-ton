package sequences

import (
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"
	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	api "github.com/smartcontractkit/chainlink-ccip/deployment/fastcurse"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
)

// CurseAdapter interface implementation

// Initialize is called once to set up the adapter. It loads necessary on-chain state (deployed onramp and router address).
func (a *TonAdapter) Initialize(e cldf.Environment, selector uint64) error {
	// Load chain state for selector
	chainState, err := state.LoadOnchainState(e)
	if err != nil {
		return fmt.Errorf("failed to load chain state for selector %d: %w", selector, err)
	}

	tonState, exist := chainState[selector]
	if !exist {
		return fmt.Errorf("no on-chain state found for selector %d", selector)
	}

	// Cache router address for fast cursing
	if a.routerAddressCache == nil {
		a.routerAddressCache = make(map[uint64]address.Address)
	}

	// Cache onRamp address for connectivity checks
	if a.onRampAddressCache == nil {
		a.onRampAddressCache = make(map[uint64]address.Address)
	}

	if tonState.Router.IsAddrNone() {
		return fmt.Errorf("router address is not set for chain selector %d", selector)
	}
	a.routerAddressCache[selector] = tonState.Router

	if tonState.OnRamp.IsAddrNone() {
		return fmt.Errorf("onRamp address is not set for chain selector %d", selector)
	}
	a.onRampAddressCache[selector] = tonState.OnRamp
	return nil
}

// IsSubjectCursedOnChain checks if a subject is cursed on a specific chain.
// Returns true if subject is cursed OR if the chain is globally cursed.
func (a *TonAdapter) IsSubjectCursedOnChain(e cldf.Environment, selector uint64, subject api.Subject) (bool, error) {
	routerAddr, exist := a.routerAddressCache[selector]
	if !exist {
		return false, fmt.Errorf("router address not found in cache for selector %d", selector)
	}

	// Get TON chain from environment
	chain, exists := e.BlockChains.TonChains()[selector]
	if !exists {
		return false, fmt.Errorf("TON chain with selector %d not found in environment", selector)
	}

	// Get current block
	block, err := chain.Client.CurrentMasterchainInfo(e.GetContext())
	if err != nil {
		return false, fmt.Errorf("failed to get current block: %w", err)
	}

	// Convert subject to *big.Int for RPC call
	subjectBigInt := subjectToBigInt(subject)

	// Call verifyNotCursed on router contract, verifyNotCursed returns 0 (false) if cursed, -1 (true) if not cursed
	// tvm.CallGetter returns true if NOT cursed, we want to return true if cursed so we need to negate
	notCursed, err := tvm.CallGetter(e.GetContext(), chain.Client, block, &routerAddr, router.GetVerifyNotCursed, subjectBigInt)
	if err != nil {
		return false, fmt.Errorf("failed to call verifyNotCursed: %w", err)
	}

	return !notCursed, nil
}

// IsChainConnectedToTargetChain returns true if the chain with selector can communicate with targetSel.
// For TON, this checks if an onRamp exists for the target chain selector.
func (a *TonAdapter) IsChainConnectedToTargetChain(e cldf.Environment, selector uint64, targetSel uint64) (bool, error) {
	// Load chain state to get router address
	onramp, exist := a.onRampAddressCache[selector]
	if !exist {
		return false, fmt.Errorf("onRamp address not found in cache for selector %d", selector)
	}

	// Get TON chain from environment
	chain, exists := e.BlockChains.TonChains()[selector]
	if !exists {
		return false, fmt.Errorf("TON chain with selector %d not found in environment", selector)
	}

	// Get current block
	block, err := chain.Client.CurrentMasterchainInfo(e.GetContext())
	if err != nil {
		return false, fmt.Errorf("failed to get current block: %w", err)
	}

	// Call isChainSupported(targetSel) to check if connection exists
	// If it returns a valid address, the chains are connected
	// TODO check if we should call onramp isChainSupported() or router onRamp()
	result, err := chain.Client.RunGetMethod(e.GetContext(), block, &onramp, "isChainSupported", targetSel)
	if err != nil {
		return false, fmt.Errorf("failed to call isChainSupported: %w", err)
	}

	// Parse result as address
	addr, err := result.Int(0)
	if err != nil {
		return false, fmt.Errorf("failed to parse isChainSupported result: %w", err)
	}

	if addr.Cmp(big.NewInt(0)) == 0 {
		return false, nil
	}

	return true, nil
}

// IsCurseEnabledForChain returns true if the chain supports cursing subjects.
// For TON, rmnRemote exists on router contract, so this function will verify if router contract is deployed.
func (a *TonAdapter) IsCurseEnabledForChain(_ cldf.Environment, selector uint64) (bool, error) {
	// Initialize() should have cached the router address
	_, exist := a.routerAddressCache[selector]
	if !exist {
		return false, nil
	}

	return true, nil
}

// ListConnectedChains returns all chain selectors that the given chain is connected to.
func (a *TonAdapter) ListConnectedChains(e cldf.Environment, selector uint64) ([]uint64, error) {
	router, exist := a.routerAddressCache[selector]
	if !exist {
		return nil, fmt.Errorf("router address not found in cache for selector %d", selector)
	}

	// Get TON chain from environment
	chain, exists := e.BlockChains.TonChains()[selector]
	if !exists {
		return nil, fmt.Errorf("TON chain with selector %d not found in environment", selector)
	}

	// Get current block
	block, err := chain.Client.CurrentMasterchainInfo(e.GetContext())
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	// Call destChainSelectors() to get all destination chains
	result, err := chain.Client.RunGetMethod(e.GetContext(), block, &router, "destChainSelectors")
	if err != nil {
		return nil, fmt.Errorf("failed to call destChainSelectors: %w", err)
	}

	// Parse result as lisp tuple
	tuple := result.AsTuple()
	connectedChains := parser.ParseLispTuple(tuple)

	return connectedChains, nil
}

// CurseSubjectAdapter interface implementation

// SubjectToSelector converts a Subject to a chain selector.
// Returns 0 for GlobalCurseSubject.
func (a *TonAdapter) SubjectToSelector(subject api.Subject) (uint64, error) {
	// Check for global curse subject
	if subject == api.GlobalCurseSubject() {
		return 0, nil
	}

	// Use generic helper to extract selector from big-endian encoding (bytes 8-15) TODO: double check if TON is using big endian
	return api.GenericSubjectToSelector(subject)
}

// SelectorToSubject converts a chain selector to a Subject.
// Uses big-endian encoding (selector in bytes 8-15).
func (a *TonAdapter) SelectorToSubject(selector uint64) api.Subject {
	// Use generic helper to encode selector as big-endian in bytes 8-15
	return api.GenericSelectorToSubject(selector)
}

// DeriveCurseAdapterVersion returns the version of the curse adapter.
// For TON, this is currently hardcoded to 1.6.0.
func (a *TonAdapter) DeriveCurseAdapterVersion(e cldf.Environment, selector uint64) (*semver.Version, error) {
	return semver.MustParse("1.6.0"), nil
}

// Action methods

// Curse returns the sequence to curse subjects on a chain.
func (a *TonAdapter) Curse() *cldf_ops.Sequence[api.CurseInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton-curse",
		semver.MustParse("1.6.0"),
		"Curse subjects on TON Router via RMN Remote",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, in api.CurseInput) (sequences.OnChainOutput, error) {
			// Validate subject format (big-endian encoding)
			for _, subject := range in.Subjects {
				if err := validateSubjectFormat(subject); err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("invalid subject format: %w", err)
				}
			}

			// Get TON chain
			chain, exists := chains.TonChains()[in.ChainSelector]
			if !exists {
				return sequences.OnChainOutput{}, fmt.Errorf("TON chain with selector %d not found", in.ChainSelector)
			}

			routerAddr, exist := a.routerAddressCache[in.ChainSelector]
			if !exist {
				return sequences.OnChainOutput{}, fmt.Errorf("router address not found in cache for selector %d", in.ChainSelector)
			}

			// Build CCIPDeps
			deps, err := buildCCIPDeps(chain, in.ChainSelector, routerAddr)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to build CCIPDeps: %w", err)
			}

			// Convert api.CurseInput.Subjects ([]Subject) to operation.CurseInput.Subjects ([]*big.Int)
			subjects := make([]*big.Int, len(in.Subjects))
			for i, subject := range in.Subjects {
				subjects[i] = subjectToBigInt(subject)
			}

			// Build operation input
			opInput := operation.CurseInput{
				Subjects: subjects,
			}

			// Execute CurseOp operation
			report, err := cldf_ops.ExecuteOperation(b, operation.CurseOp, deps, opInput)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to execute curse operation: %w", err)
			}

			err = helpers.ExecuteTransactions(b.GetContext(), b.Logger, chain.Client, chain.Wallet, report.Output)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to execute post-deployment transactions: %w", err)
			}

			return sequences.OnChainOutput{}, nil
		},
	)
}

// Uncurse returns the sequence to lift the curse on subjects on a chain.
func (a *TonAdapter) Uncurse() *cldf_ops.Sequence[api.CurseInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton-uncurse",
		semver.MustParse("1.6.0"),
		"Uncurse subjects on TON Router via RMN Remote",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, in api.CurseInput) (sequences.OnChainOutput, error) {
			// Validate subject format (big-endian encoding)
			for _, subject := range in.Subjects {
				if err := validateSubjectFormat(subject); err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("invalid subject format: %w", err)
				}
			}

			// Get TON chain
			chain, exists := chains.TonChains()[in.ChainSelector]
			if !exists {
				return sequences.OnChainOutput{}, fmt.Errorf("TON chain with selector %d not found", in.ChainSelector)
			}

			routerAddr, exist := a.routerAddressCache[in.ChainSelector]
			if !exist {
				return sequences.OnChainOutput{}, fmt.Errorf("router address not found in cache for selector %d", in.ChainSelector)
			}

			// Build CCIPDeps
			deps, err := buildCCIPDeps(chain, in.ChainSelector, routerAddr)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to build CCIPDeps: %w", err)
			}

			// Convert api.CurseInput.Subjects ([]Subject) to operation.UncurseInput.Subjects ([]*big.Int)
			subjects := make([]*big.Int, len(in.Subjects))
			for i, subject := range in.Subjects {
				subjects[i] = subjectToBigInt(subject)
			}

			// Build operation input
			opInput := operation.UncurseInput{
				Subjects: subjects,
			}

			// Execute UncurseOp operation
			report, err := cldf_ops.ExecuteOperation(b, operation.UncurseOp, deps, opInput)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to execute uncurse operation: %w", err)
			}

			err = helpers.ExecuteTransactions(b.GetContext(), b.Logger, chain.Client, chain.Wallet, report.Output)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to execute post-deployment transactions: %w", err)
			}

			return sequences.OnChainOutput{}, nil
		},
	)
}

// Helper functions

// validateSubjectFormat validates that the subject uses big-endian encoding
// For TON, chain selectors are encoded in the last 8 bytes (big-endian)
// The first 8 bytes should be zeros, except for GlobalCurseSubject
func validateSubjectFormat(subject api.Subject) error {
	// Global curse subject has a special pattern, allow it
	if subject == api.GlobalCurseSubject() {
		return nil
	}

	// For regular chain selectors, first 8 bytes should be 0, TODO double check this
	for i := 0; i < 8; i++ {
		if subject[i] != 0 {
			return fmt.Errorf("invalid subject format for TON: expected big-endian encoding with zeros in first 8 bytes, got subject=%v", subject)
		}
	}

	return nil
}

// subjectToBigInt converts a [16]byte Subject to *big.Int for RPC calls
func subjectToBigInt(subject api.Subject) *big.Int {
	return new(big.Int).SetBytes(subject[:])
}

// buildCCIPDeps builds the CCIPDeps structure needed for operations
func buildCCIPDeps(tonChain cldf_ton.Chain, selector uint64, routerAddr address.Address) (config.CCIPDeps, error) {
	return config.CCIPDeps{
		TonChain: tonChain,
		CCIPOnChainState: map[uint64]state.CCIPChainState{
			selector: {
				// fast curse operations should only need the router address
				Router: routerAddr,
			},
		},
	}, nil
}
