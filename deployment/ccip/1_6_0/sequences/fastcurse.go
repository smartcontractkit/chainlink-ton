package sequences

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	api "github.com/smartcontractkit/chainlink-ccip/deployment/fastcurse"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"

	"github.com/smartcontractkit/mcms/types"
)

// TonCurseAdapter implements the fastcurse.CurseAdapter and fastcurse.CurseSubjectAdapter interfaces for TON chains.
type TonCurseAdapter struct {
	routerAddressCache map[uint64]address.Address
	onRampAddressCache map[uint64]address.Address
}

// CurseAdapter interface implementation

// Initialize is called once to set up the adapter. It loads necessary on-chain state (deployed onramp and router address).
func (a *TonCurseAdapter) Initialize(e cldf.Environment, selector uint64) error {
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
func (a *TonCurseAdapter) IsSubjectCursedOnChain(e cldf.Environment, selector uint64, subject api.Subject) (bool, error) {
	routerAddr, exist := a.routerAddressCache[selector]
	if !exist {
		return false, fmt.Errorf("router address not found in cache for selector %d", selector)
	}

	// Get TON chain from environment
	chain, ok := e.BlockChains.TonChains()[selector]
	if !ok {
		return false, fmt.Errorf("TON chain with selector %d not found in environment", selector)
	}

	// Convert subject to *big.Int for RPC call
	subjectBigInt := new(big.Int).SetBytes(subject[:])

	// Call verifyNotCursed on router contract, verifyNotCursed returns 0 (false) if cursed, -1 (true) if not cursed
	// tvm.CallGetter returns true if NOT cursed, we want to return true if cursed so we need to negate
	notCursed, err := tvm.CallGetterLatest(e.GetContext(), chain.Client, &routerAddr, router.GetVerifyNotCursed, subjectBigInt)
	if err != nil {
		return false, fmt.Errorf("failed to call verifyNotCursed: %w", err)
	}

	return !notCursed, nil
}

// IsChainConnectedToTargetChain returns true if the chain with selector can communicate with targetSel.
// For TON, this checks if an onRamp exists for the target chain selector.
func (a *TonCurseAdapter) IsChainConnectedToTargetChain(e cldf.Environment, selector uint64, targetSel uint64) (bool, error) {
	// Load chain state to get router address
	onramp, exist := a.onRampAddressCache[selector]
	if !exist {
		return false, fmt.Errorf("onRamp address not found in cache for selector %d", selector)
	}

	// Get TON chain from environment
	chain, ok := e.BlockChains.TonChains()[selector]
	if !ok {
		return false, fmt.Errorf("TON chain with selector %d not found in environment", selector)
	}

	// Get current block
	block, err := chain.Client.CurrentMasterchainInfo(e.GetContext())
	if err != nil {
		return false, fmt.Errorf("failed to get current block: %w", err)
	}

	// TODO: extract a Getter and use tvm.CallGetterLatest
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
func (a *TonCurseAdapter) IsCurseEnabledForChain(_ cldf.Environment, selector uint64) (bool, error) {
	// Initialize() should have cached the router address
	_, exist := a.routerAddressCache[selector]
	if !exist {
		return false, nil
	}

	return true, nil
}

// ListConnectedChains returns all chain selectors that the given chain is connected to.
func (a *TonCurseAdapter) ListConnectedChains(e cldf.Environment, selector uint64) ([]uint64, error) {
	router, exist := a.routerAddressCache[selector]
	if !exist {
		return nil, fmt.Errorf("router address not found in cache for selector %d", selector)
	}

	// Get TON chain from environment
	chain, ok := e.BlockChains.TonChains()[selector]
	if !ok {
		return nil, fmt.Errorf("TON chain with selector %d not found in environment", selector)
	}

	// Get current block
	block, err := chain.Client.CurrentMasterchainInfo(e.GetContext())
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	// TODO: extract a Getter and use tvm.CallGetterLatest
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
func (a *TonCurseAdapter) SubjectToSelector(subject api.Subject) (uint64, error) {
	// Check for global curse subject
	if subject == api.GlobalCurseSubject() {
		return 0, nil
	}

	// Use generic helper to extract selector from big-endian encoding (bytes 8-15) TODO: double check if TON is using big endian
	return api.GenericSubjectToSelector(subject)
}

// SelectorToSubject converts a chain selector to a Subject.
// Uses big-endian encoding (selector in bytes 8-15).
func (a *TonCurseAdapter) SelectorToSubject(selector uint64) api.Subject {
	// Use generic helper to encode selector as big-endian in bytes 8-15
	return api.GenericSelectorToSubject(selector)
}

// DeriveCurseAdapterVersion returns the version of the curse adapter.
// For TON, this is currently hardcoded to 1.6.0.
func (a *TonCurseAdapter) DeriveCurseAdapterVersion(e cldf.Environment, selector uint64) (*semver.Version, error) {
	return semver.MustParse("1.6.0"), nil
}

// Action methods

// Curse returns the sequence to curse subjects on a chain.
func (a *TonCurseAdapter) Curse() *cldf_ops.Sequence[api.CurseInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/curse",
		semver.MustParse("1.6.0"),
		"Curse subjects on TON Router via RMN Remote",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, in api.CurseInput) (sequences.OnChainOutput, error) {
			if len(in.Subjects) == 0 {
				return sequences.OnChainOutput{}, errors.New("no subjects provided for curse")
			}

			// Validate subject format (big-endian encoding)
			for _, subject := range in.Subjects {
				if err := validateSubjectFormat(subject); err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("invalid subject format: %w", err)
				}
			}

			// Get TON chain
			chain, ok := chains.TonChains()[in.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("TON chain with selector %d not found", in.ChainSelector)
			}

			_routerAddr, ok := a.routerAddressCache[in.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("router address not found in cache for selector %d", in.ChainSelector)
			}

			stateCCIP := state.CCIPChainState{
				// fast curse operations should only need the router address
				Router: _routerAddr,
			}

			dp, err := dep.NewDependencyProvider(
				dep.Provide(chain),
				dep.Provide(stateCCIP),
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
			}

			// Convert api.CurseInput.Subjects ([]Subject) to []router.Subject
			subjects := make([]router.Subject, len(in.Subjects))
			for i, subject := range in.Subjects {
				subjects[i] = router.Subject{Value: new(big.Int).SetBytes(subject[:])}
			}

			// Create uncurse message
			contractType := bindings.PkgCCIP + ".Router"
			body := router.RMNRemoteCurse{Subjects: subjects}

			// Get router address from chain state
			routerAddr := stateCCIP.Router

			// Notice: planning option depends on ownership. If sender is not the owner, we should plan via timelock.
			ctx := b.GetContext()
			sender := chain.Wallet.Address()

			owner, err := tvm.CallGetterLatest(ctx, chain.Client, &routerAddr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get router owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner

			_in := ton.SendMessagesInput{
				Messages: []ton.InternalMessage[any]{
					{
						Bounce:  true,
						DstAddr: &routerAddr,
						Amount:  tlb.MustFromTON("0.1"), // TON amount for gas
						Body:    codec.MustWrapMessage[any](contractType, body),
					},
				},
				Plan: plan,
			}

			r, err := cldf_ops.ExecuteOperation(b, ton.SendMessages, dp, _in)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
			}

			out := sequences.OnChainOutput{}
			meta := []types.OperationMetadata{
				{ContractType: contractType, Tags: []string{}}, // TODO: add appropriate tags
			}

			return mcms.WithOperationOutput(out, r.Output, types.ChainSelector(in.ChainSelector), meta)
		},
	)
}

// Uncurse returns the sequence to lift the curse on subjects on a chain.
func (a *TonCurseAdapter) Uncurse() *cldf_ops.Sequence[api.CurseInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/uncurse",
		semver.MustParse("1.6.0"),
		"Uncurse subjects on TON Router via RMN Remote",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, in api.CurseInput) (sequences.OnChainOutput, error) {
			if len(in.Subjects) == 0 {
				return sequences.OnChainOutput{}, errors.New("no subjects provided for uncurse")
			}

			// Validate subject format (big-endian encoding)
			for _, subject := range in.Subjects {
				if err := validateSubjectFormat(subject); err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("invalid subject format: %w", err)
				}
			}

			// Get TON chain
			chain, ok := chains.TonChains()[in.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("TON chain with selector %d not found", in.ChainSelector)
			}

			_routerAddr, ok := a.routerAddressCache[in.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("router address not found in cache for selector %d", in.ChainSelector)
			}

			stateCCIP := state.CCIPChainState{
				// fast curse operations should only need the router address
				Router: _routerAddr,
			}

			dp, err := dep.NewDependencyProvider(
				dep.Provide(chain),
				dep.Provide(stateCCIP),
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
			}

			// Convert api.CurseInput.Subjects ([]Subject) to []router.Subject
			subjects := make([]router.Subject, len(in.Subjects))
			for i, subject := range in.Subjects {
				subjects[i] = router.Subject{Value: new(big.Int).SetBytes(subject[:])}
			}

			// Create uncurse message
			contractType := bindings.PkgCCIP + ".Router"
			body := router.RMNRemoteUncurse{Subjects: subjects}
			// Get router address from chain state
			routerAddr := stateCCIP.Router

			// Notice: planning option depends on ownership. If sender is not the owner, we should plan via timelock.
			ctx := b.GetContext()
			sender := chain.Wallet.Address()

			owner, err := tvm.CallGetterLatest(ctx, chain.Client, &routerAddr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get router owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner

			_in := ton.SendMessagesInput{
				Messages: []ton.InternalMessage[any]{
					{
						Bounce:  true,
						DstAddr: &routerAddr,
						Amount:  tlb.MustFromTON("0.1"), // TON amount for gas
						Body:    codec.MustWrapMessage[any](contractType, body),
					},
				},
				Plan: plan,
			}

			r, err := cldf_ops.ExecuteOperation(b, ton.SendMessages, dp, _in)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
			}

			out := sequences.OnChainOutput{}
			meta := []types.OperationMetadata{
				{ContractType: contractType, Tags: []string{}}, // TODO: add appropriate tags
			}

			return mcms.WithOperationOutput(out, r.Output, types.ChainSelector(in.ChainSelector), meta)
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

var _ api.CurseAdapter = &TonCurseAdapter{}
