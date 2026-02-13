package ton

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
)

// FundMode can be parsed from string in the input JSON, ("ExactAmount", "TopUp").
//
//go:generate go run github.com/dmarkham/enumer@v1.6.3 -type=FundMode -json -text -trimprefix=FundMode
type FundMode uint8

const (
	// FundModeTopUp means the current balance of the contract will be topped up to reach the specified amount (i.e. if the contract already has some balance, only the difference between the current balance and the target amount will be transferred). If the current balance is greater than or equal to the target amount, no transfer will be made.
	FundModeTopUp FundMode = iota
	// FundModeExactAmount means the specified amount will be transferred to the contract, regardless of its current balance.
	FundModeExactAmount
)

var ModeDefault = FundModeTopUp

// TargetProtocol can be parsed from string in the input JSON, ( "CCIP", "MCMS").
//
//go:generate go run github.com/dmarkham/enumer@v1.6.3 -type=TargetProtocol -json -text -trimprefix=TargetProtocol
type TargetProtocol uint8

const (
	TargetProtocolCCIP TargetProtocol = iota
	TargetProtocolMCMS
)

// OneOf represents a configuration value that can be either:
//   - A simple string: "key"
//   - An object with items: {key: [item1, item2]}
//
// This provides a generic, reusable structure for parsing flexible YAML/JSON
// configurations where entries can be simple identifiers or include nested lists.
//
// Type parameter I is the item type (typically string or an enum).
// Examples:
//   - OneOf[string]:     Parse "MCMS" or {MCMS: ["CLLCCIP", "RMNMCMS"]}
//   - OneOf[TypeEnum]:   Parse "v1.6.0" or {v1.6.0: [Router, OnRamp]}
type OneOf[I any] struct {
	Key   string // The discriminator/identifier (e.g., protocol, qualifier, version)
	Items []I    // Optional list of sub-items; nil/empty for simple string form
}

// UnmarshalYAML implements custom YAML unmarshaling to handle both string and object formats
func (o *OneOf[I]) UnmarshalYAML(unmarshal func(interface{}) error) error {
	// Try parsing as a simple string first
	var str string
	if err := unmarshal(&str); err == nil {
		o.Key = str
		o.Items = nil
		return nil
	}

	// Try parsing as an object with items: {key: [items]}
	var obj map[string][]I
	if err := unmarshal(&obj); err != nil {
		return fmt.Errorf("value must be a string or object with items: %w", err)
	}

	if len(obj) != 1 {
		return errors.New("object must have exactly one key")
	}

	for key, items := range obj {
		o.Key = key
		o.Items = items
		return nil
	}

	return errors.New("invalid format")
}

// UnmarshalJSON implements custom JSON unmarshaling (same logic as YAML)
func (o *OneOf[I]) UnmarshalJSON(data []byte) error {
	// Try parsing as a simple string first
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		o.Key = str
		o.Items = nil
		return nil
	}

	// Try parsing as an object with items: {key: [items]}
	var obj map[string][]I
	if err := json.Unmarshal(data, &obj); err != nil {
		return fmt.Errorf("value must be a string or object with items: %w", err)
	}

	if len(obj) != 1 {
		return errors.New("object must have exactly one key")
	}

	for key, items := range obj {
		o.Key = key
		o.Items = items
		return nil
	}

	return errors.New("invalid format")
}

// TargetSpec represents a target configuration parsed from OneOf format,
// with validation and conversion to typed enum.
type TargetSpec struct {
	Protocol   TargetProtocol
	Qualifiers []string
}

// UnmarshalYAML implements custom YAML unmarshaling with validation
func (t *TargetSpec) UnmarshalYAML(unmarshal func(interface{}) error) error {
	var raw OneOf[string]
	if err := raw.UnmarshalYAML(unmarshal); err != nil {
		return err
	}

	// Validate and convert key to typed enum
	protocol, err := TargetProtocolString(raw.Key)
	if err != nil {
		return fmt.Errorf("invalid target protocol %q: %w", raw.Key, err)
	}

	// Validate items (qualifiers) are non-empty
	if slices.Contains(raw.Items, "") {
		return errors.New("qualifier cannot be empty")
	}

	t.Protocol = protocol
	t.Qualifiers = raw.Items
	return nil
}

// UnmarshalJSON implements custom JSON unmarshaling with validation
func (t *TargetSpec) UnmarshalJSON(data []byte) error {
	var raw OneOf[string]
	if err := raw.UnmarshalJSON(data); err != nil {
		return err
	}

	// Validate and convert key to typed enum
	protocol, err := TargetProtocolString(raw.Key)
	if err != nil {
		return fmt.Errorf("invalid target protocol %q: %w", raw.Key, err)
	}

	// Validate items (qualifiers) are non-empty
	if slices.Contains(raw.Items, "") {
		return errors.New("qualifier cannot be empty")
	}

	t.Protocol = protocol
	t.Qualifiers = raw.Items
	return nil
}

// ToResolver converts the TargetSpec to the appropriate ProtocolResolvers implementation
func (t TargetSpec) ToResolver() (ProtocolResolvers, error) {
	switch t.Protocol {
	case TargetProtocolCCIP:
		if len(t.Qualifiers) > 0 {
			return nil, errors.New("CCIP does not support qualifiers yet")
		}
		return CCIPTarget{}, nil
	case TargetProtocolMCMS:
		return MCMSTarget{Qualifiers: t.Qualifiers}, nil
	default:
		return nil, fmt.Errorf("unknown protocol: %v", t.Protocol)
	}
}

type FundContractsInput struct {
	// Funding mode, either "ExactAmount" or "TopUp" to target amount. Defaults to TopUp.
	Mode *FundMode `json:"mode"`
	// Decimal string representing the amount in TON (e.g. "1.5" for 1.5 TON or 1_500_000_000 nanoton)
	//
	// If Mode is FundModeExactAmount, this is the exact amount to transfer to the contract.
	// If Mode is FundModeTopUp, this is the target balance for the contract after funding (i.e. current balance will be topped up to reach this amount).
	Amount string `json:"amount"`
	// Targets specifies which contracts to fund.
	// Can be a list of strings and/or objects:
	//   - "CCIP" (string): Fund all CCIP contracts (Router, OnRamp, OffRamp, FeeQuoter)
	//   - "MCMS" (string): Fund all MCMS contracts (all qualifiers)
	//   - {MCMS: ["qualifier1", "qualifier2"]} (object): Fund specific MCMS qualifiers
	// If omitted, defaults to funding all contracts (both CCIP and MCMS).
	// Examples:
	//   targets: ["CCIP"]                           # CCIP only
	//   targets: ["MCMS"]                           # All MCMS
	//   targets: [{MCMS: ["CLLCCIP", "RMNMCMS"]}]      # Specific MCMS qualifiers
	//   targets: ["CCIP", {MCMS: ["CLLCCIP", "RMNMCMS"]}]      # CCIP + specific MCMS
	Targets []TargetSpec `json:"targets,omitempty"`

	Plan bool `json:"plan"`
}

func (in FundContractsInput) IsPlan() bool {
	return in.Plan
}

type FundContractsOutput SendMessagesOutput

func (o FundContractsOutput) GetPlans() []MessagePlanRaw {
	return o.Plans
}

func (o FundContractsOutput) GetTransaction() *tlbe.Cell[tlb.Transaction] {
	return o.Transaction
}

var FundContractsOp = operations.NewOperation(
	"ton/ops/fund-contracts",
	semver.MustParse("0.1.0"),
	"Funds CCIP/MCMS contracts with the specified amounts",
	fundContracts,
)

type parsedFundContractsInput struct {
	Mode    FundMode
	Amount  tlb.Coins
	Targets parsedTarget
	Plan    bool
}

// ProtocolResolvers resolves contracts for a specific protocol
type ProtocolResolvers interface {
	Resolve(b operations.Bundle, dp *dep.DependencyProvider) ([]targetContract, error)
}

// CCIPTarget resolves CCIP contracts (Router, OnRamp, OffRamp, FeeQuoter)
type CCIPTarget struct{}

func (t CCIPTarget) Resolve(b operations.Bundle, dp *dep.DependencyProvider) ([]targetContract, error) {
	ccipState, err := dep.Resolve[tonstate.CCIPChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}
	return []targetContract{
		{name: "Router", addr: ccipState.Router},
		{name: "OnRamp", addr: ccipState.OnRamp},
		{name: "OffRamp", addr: ccipState.OffRamp},
		{name: "FeeQuoter", addr: ccipState.FeeQuoter},
	}, nil
}

// MCMSTarget resolves MCMS contracts (MCMS and Timelock) for specified qualifiers
type MCMSTarget struct {
	Qualifiers []string // empty = all qualifiers, non-empty = specific qualifiers
}

func (t MCMSTarget) Resolve(b operations.Bundle, dp *dep.DependencyProvider) ([]targetContract, error) {
	mcmsState, err := dep.Resolve[tonstate.MCMSChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton mcms state: %w", err)
	}

	var contracts []targetContract
	appendMCMSState := func(qualifier string, state *state.MCMSSuiteState) {
		// TBD: Can these be nil? Should we error if they are?
		if state.MCMS != nil {
			contracts = append(contracts, targetContract{
				name: fmt.Sprintf("%s/MCMS", qualifier),
				addr: *state.MCMS,
			})
		}
		if state.Timelock != nil {
			contracts = append(contracts, targetContract{
				name: fmt.Sprintf("%s/Timelock", qualifier),
				addr: *state.Timelock,
			})
		}
	}

	if len(t.Qualifiers) == 0 {
		// Fund all MCMS qualifiers
		for qualifier, state := range mcmsState.ByQualifier {
			appendMCMSState(qualifier, state)
		}
	} else {
		// Fund specific qualifiers
		for _, qualifier := range t.Qualifiers {
			state, ok := mcmsState.ByQualifier[qualifier]
			if !ok {
				return nil, fmt.Errorf("no MCMS suite found for qualifier %s", qualifier)
			}
			appendMCMSState(qualifier, state)
		}
	}

	return contracts, nil
}

type parsedTarget struct {
	Protocols []ProtocolResolvers
}

func fundContracts(b operations.Bundle, dp *dep.DependencyProvider, in FundContractsInput) (FundContractsOutput, error) {
	parsedInput, err := parseFundContractsInput(in)
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to parse input: %w", err)
	}

	tonChain, err := dep.Resolve[cldf_ton.Chain](dp)
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to resolve ton chain: %w", err)
	}

	targetContracts, err := resolveTargetContracts(b, dp, parsedInput.Targets)
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to resolve target contracts: %w", err)
	}

	messages, err := func() ([]InternalMessage[any], error) {
		if parsedInput.Mode == FundModeExactAmount {
			return prepareTransfers(parsedInput.Amount, targetContracts)
		}
		return prepareTopUps(b.GetContext(), b.Logger, parsedInput.Amount, targetContracts, tonChain)
	}()
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to generate funding requests: %w", err)
	}

	_in := SendMessagesInput{
		Messages: messages,
		Plan:     parsedInput.Plan,
	}

	r, err := operations.ExecuteOperation(b, SendMessages, dp, _in)
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to execute send messages operation: %w", err)
	}

	return FundContractsOutput(r.Output), nil
}

func parseFundContractsInput(in FundContractsInput) (parsedFundContractsInput, error) {
	amount, err := tlb.FromTON(in.Amount)
	if err != nil {
		return parsedFundContractsInput{}, fmt.Errorf("failed to parse amount: %w", err)
	}

	mode := ModeDefault
	if in.Mode != nil {
		mode = *in.Mode
	}

	targets, err := parseTargets(in.Targets)
	if err != nil {
		return parsedFundContractsInput{}, fmt.Errorf("failed to parse targets: %w", err)
	}

	return parsedFundContractsInput{
		Mode:    mode,
		Amount:  amount,
		Targets: *targets,
		Plan:    in.Plan,
	}, nil
}

func parseTargets(targets []TargetSpec) (*parsedTarget, error) {
	// If no targets specified, fund everything
	if len(targets) == 0 {
		return &parsedTarget{
			Protocols: []ProtocolResolvers{
				CCIPTarget{},
				MCMSTarget{Qualifiers: nil}, // empty = all qualifiers
			},
		}, nil
	}

	resolvers := make([]ProtocolResolvers, 0, len(targets))
	for i, targetSpec := range targets {
		resolver, err := targetSpec.ToResolver()
		if err != nil {
			return nil, fmt.Errorf("invalid target at index %d: %w", i, err)
		}
		resolvers = append(resolvers, resolver)
	}

	return &parsedTarget{Protocols: resolvers}, nil
}

type targetContract struct {
	name string
	addr address.Address
}

func resolveTargetContracts(b operations.Bundle, dp *dep.DependencyProvider, targets parsedTarget) ([]targetContract, error) {
	var targetContracts []targetContract

	for _, resolver := range targets.Protocols {
		contracts, err := resolver.Resolve(b, dp)
		if err != nil {
			return nil, err
		}
		targetContracts = append(targetContracts, contracts...)
	}

	return targetContracts, nil
}

func prepareTransfers(amount tlb.Coins, targetContracts []targetContract) ([]InternalMessage[any], error) {
	requests := make([]InternalMessage[any], 0, len(targetContracts))
	for _, contract := range targetContracts {
		if contract.addr.IsAddrNone() {
			continue
		}

		requests = append(requests, fundingMessage(contract.addr, amount))
	}
	return requests, nil
}

func prepareTopUps(ctx context.Context, logger logger.Logger, targetAmount tlb.Coins, targetContracts []targetContract, tonChain cldf_ton.Chain) ([]InternalMessage[any], error) {
	requests := make([]InternalMessage[any], 0, len(targetContracts))
	for _, contract := range targetContracts {
		if contract.addr.IsAddrNone() {
			continue
		}

		block, err := tonChain.Client.CurrentMasterchainInfo(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get current masterchain info: %w", err)
		}
		contractState, err := tonChain.Client.GetAccount(ctx, block, &contract.addr)
		if err != nil {
			return nil, fmt.Errorf("failed to get account state for contract %s: %w", contract.name, err)
		}
		contractBalance := contractState.State.Balance
		if contractBalance.GreaterOrEqual(&targetAmount) {
			logger.Infof("Contract %s (%s) already has balance %s greater than or equal to target amount %s, skipping funding\n", contract.name, contract.addr.String(), contractBalance.String(), targetAmount.String())
			continue
		}
		amount, err := targetAmount.Sub(&contractBalance)
		if err != nil {
			return nil, fmt.Errorf("failed to calculate top-up amount for contract %s: %w", contract.name, err)
		}

		requests = append(requests, fundingMessage(contract.addr, *amount))
	}
	return requests, nil
}

func fundingMessage(addr address.Address, amount tlb.Coins) InternalMessage[any] {
	return InternalMessage[any]{
		Bounce:  true, // bouncing is enabled to avoid losing funds in case of incorrect addresses or other issues. All CCIP/MCMS contracts should accept empty message.
		DstAddr: &addr,
		Amount:  amount,
		Body:    nil, // empty message
	}
}
