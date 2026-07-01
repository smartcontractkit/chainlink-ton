package resolvers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

var (
	_ codec.Resolver[map[string]any, opston.InternalMessage[any]] = (*topUpResolver)(nil)
	_ codec.ResolverKeyProvider                                   = (*topUpResolver)(nil)
)

// topUpResolver resolves the difference between current balance and target balance for a given address,
// returning an InternalMessage to fund the contract to the target amount
type topUpResolver struct {
	chainSelector uint64
	dataStore     cldfds.DataStore
	chain         cldf_ton.Chain
}

func NewTopUpResolver(chainSelector uint64, dataStore cldfds.DataStore, chain cldf_ton.Chain) codec.Resolver[map[string]any, opston.InternalMessage[any]] {
	return &topUpResolver{
		chainSelector: chainSelector,
		dataStore:     dataStore,
		chain:         chain,
	}
}

func (r *topUpResolver) Key() string {
	return "codec.resolvers.top-up-message"
}

type topUpInput struct {
	DstAddr      *address.Address `json:"dstAddr"`      // Address to top up (can be raw string or resolved by nested resolver)
	TargetAmount string           `json:"targetAmount"` // Decimal string like "10.5"
}

// Resolve calculates the difference between current balance and target balance and returns an InternalMessage
func (r *topUpResolver) Resolve(input map[string]any) (opston.InternalMessage[any], error) {
	if input == nil {
		return opston.InternalMessage[any]{}, errors.New("cannot resolve nil input")
	}

	data, ok := input["data"]
	if !ok {
		return opston.InternalMessage[any]{}, fmt.Errorf("missing 'data' field in input: %v", input)
	}

	if data == nil {
		return opston.InternalMessage[any]{}, errors.New("data field cannot be nil")
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return opston.InternalMessage[any]{}, fmt.Errorf("failed to marshal 'data' field: %w", err)
	}

	var in topUpInput
	err = json.Unmarshal(dataBytes, &in)
	if err != nil {
		return opston.InternalMessage[any]{}, fmt.Errorf("failed to unmarshal 'data' field to topUpInput: %w", err)
	}

	if in.DstAddr == nil {
		return opston.InternalMessage[any]{}, errors.New("dstAddr cannot be nil")
	}

	// Parse target amount
	targetAmount, err := tlb.FromTON(in.TargetAmount)
	if err != nil {
		return opston.InternalMessage[any]{}, fmt.Errorf("failed to parse target amount: %w", err)
	}

	// Get current balance
	ctx := context.TODO()
	block, err := r.chain.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return opston.InternalMessage[any]{}, fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	contractState, err := r.chain.Client.WaitForBlock(block.SeqNo).GetAccount(ctx, block, in.DstAddr)
	if err != nil {
		return opston.InternalMessage[any]{}, fmt.Errorf("failed to get balance for address %s: %w", in.DstAddr.String(), err)
	}

	currentBalance := tlb.ZeroCoins
	if contractState != nil && contractState.State != nil {
		currentBalance = contractState.State.Balance
	}

	// Calculate difference

	if currentBalance.GreaterOrEqual(&targetAmount) {
		return opston.InternalMessage[any]{}, nil // No top-up needed (TODO no-op)
	}
	amountToSend, err := targetAmount.Sub(&currentBalance)
	if err != nil {
		return opston.InternalMessage[any]{}, fmt.Errorf("failed to calculate top-up amount: %w", err)
	}

	// Create an InternalMessage to send the amount
	msg := opston.InternalMessage[any]{
		Bounce:  false,
		DstAddr: in.DstAddr,
		Amount:  *amountToSend,
		Body:    nil,
	}

	return msg, nil
}
