package sequences

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/samber/lo"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"

	api "github.com/smartcontractkit/chainlink-ccip/deployment/fastcurse"
	ccipds "github.com/smartcontractkit/chainlink-ccip/deployment/utils/datastore"
	ccipdmcms "github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"

	"github.com/smartcontractkit/mcms/types"
)

// TonCurseAdapter implements the fastcurse.CurseAdapter and fastcurse.CurseSubjectAdapter interfaces for TON chains.
type TonCurseAdapter struct {
	routerAddressCache map[uint64]address.Address
	onRampAddressCache map[uint64]address.Address
	// env is retained so the curse authority (the executing timelock, when the
	// caller asked for a proposal) can be resolved from the datastore.
	env *cldf.Environment
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

	a.env = &e
	return nil
}

// curseAuthorityVersion is the first Router release where curse authority is a
// role rather than plain RMN ownership. Older Routers only expose rmn_owner.
var curseAuthorityVersion = semver.MustParse("1.7.0")

// effectiveSender is the address that will actually deliver the message: the
// deployer key on a direct send, or the executing timelock when the caller
// selected an MCMS suite.
func (a *TonCurseAdapter) effectiveSender(selector uint64, qualifier string, wallet *address.Address) (*address.Address, error) {
	if qualifier == "" {
		return wallet, nil
	}
	if a.env == nil {
		return nil, errors.New("adapter not initialized: no environment to resolve the MCMS qualifier against")
	}
	ref, err := (&MCMSReaderAdapter{}).GetTimelockRef(*a.env, selector, ccipdmcms.Input{Qualifier: qualifier})
	if err != nil {
		return nil, fmt.Errorf("failed to get timelock ref for qualifier %q on chain %d: %w", qualifier, selector, err)
	}
	addr, err := ccipds.FindAndFormatRef(a.env.DataStore, ref, selector, utils.ToTONAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve timelock address for qualifier %q on chain %d: %w", qualifier, selector, err)
	}
	return addr, nil
}

// canAct reports whether `sender` may curse (uncurse when `uncurse` is set) on
// the Router. Router 1.7.0 split curse authority into CURSE_ROLE/UNCURSE_ROLE
// with the RMN owner as an implicit bearer of both, which rmn_canCurse and
// rmn_canUncurse account for. The same adapter serves not-yet-upgraded Routers,
// where those getters do not exist and the RMN owner is the sole authority.
func (a *TonCurseAdapter) canAct(
	ctx context.Context,
	chain cldfton.Chain,
	routerAddr *address.Address,
	sender *address.Address,
	uncurse bool,
) (bool, error) {
	tv, err := tvm.CallGetterLatest(ctx, chain.Client, routerAddr, common.GetTypeAndVersion)
	if err != nil {
		return false, fmt.Errorf("failed to get router typeAndVersion: %w", err)
	}
	version, err := semver.NewVersion(strings.TrimSpace(tv.Version))
	if err != nil {
		return false, fmt.Errorf("failed to parse router version %q: %w", tv.Version, err)
	}

	if version.LessThan(curseAuthorityVersion) {
		owner, ownerErr := tvm.CallGetterLatest(ctx, chain.Client, routerAddr, router.GetRMNOwner)
		if ownerErr != nil {
			return false, fmt.Errorf("failed to get router rmn owner: %w", ownerErr)
		}
		return sender.Equals(owner), nil
	}

	getter := router.GetRMNCanCurse
	if uncurse {
		getter = router.GetRMNCanUncurse
	}
	can, err := tvm.CallGetterLatest(ctx, chain.Client, routerAddr, getter, sender)
	if err != nil {
		return false, fmt.Errorf("failed to get %s: %w", getter.Name, err)
	}
	return can, nil
}

// planCurse decides between a direct send and an MCMS proposal, and fails fast
// when the resulting message would revert for lack of authority.
func (a *TonCurseAdapter) planCurse(
	ctx context.Context,
	chain cldfton.Chain,
	in api.CurseInput,
	routerAddr *address.Address,
	uncurse bool,
) (bool, error) {
	wallet := chain.Wallet.Address()
	sender, err := a.effectiveSender(in.ChainSelector, in.MCMSQualifier, wallet)
	if err != nil {
		return false, err
	}

	authorized, err := a.canAct(ctx, chain, routerAddr, sender, uncurse)
	if err != nil {
		return false, err
	}
	if !authorized {
		action := "curse"
		if uncurse {
			action = "uncurse"
		}
		return false, fmt.Errorf(
			"%s may not %s on router %s: it is neither the RMN owner nor a role holder; "+
				"set the MCMS qualifier to a suite that holds the role (got %q)",
			sender, action, routerAddr, in.MCMSQualifier)
	}

	return !wallet.Equals(sender), nil
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
	result, err := chain.Client.WaitForBlock(block.SeqNo).RunGetMethod(e.GetContext(), block, &onramp, "isChainSupported", targetSel)
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
	result, err := chain.Client.WaitForBlock(block.SeqNo).RunGetMethod(e.GetContext(), block, &router, "destChainSelectors")
	if err != nil {
		return nil, fmt.Errorf("failed to call destChainSelectors: %w", err)
	}

	// Parse result as lisp tuple
	tuple := result.AsTuple()
	selectorsBigInt, err := parser.ParseLispTuple[*big.Int](tuple)
	if err != nil {
		return nil, fmt.Errorf("failed to parse destChainSelectors result: %w", err)
	}
	connectedChains := lo.Map(selectorsBigInt, func(x *big.Int, _ int) uint64 { return x.Uint64() })

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

			plan, err := a.planCurse(b.GetContext(), chain, in, &routerAddr, false)
			if err != nil {
				return sequences.OnChainOutput{}, err
			}

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
			meta := []mcms.OperationMetadata{
				{
					ContractType:     bindings.ShortRouter,
					Tags:             []string{},
					ContractTypeFull: bindings.TypeRouter,
				}, // TODO: add appropriate tags
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

			plan, err := a.planCurse(b.GetContext(), chain, in, &routerAddr, true)
			if err != nil {
				return sequences.OnChainOutput{}, err
			}

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
			meta := []mcms.OperationMetadata{
				{
					ContractType:     bindings.ShortRouter,
					Tags:             []string{},
					ContractTypeFull: bindings.TypeRouter,
				}, // TODO: add appropriate tags
			}

			return mcms.WithOperationOutput(out, r.Output, types.ChainSelector(in.ChainSelector), meta)
		},
	)
}

var _ api.CurseAdapter = &TonCurseAdapter{}
