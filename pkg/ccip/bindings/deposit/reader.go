package deposit

import (
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// GetTypeAndVersion gets the contract type and version (delegates to common).
var GetTypeAndVersion = common.GetTypeAndVersion

// GetOwner gets the account owner address.
//
// On-chain: get fun getOwner(): address
var GetOwner = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "getOwner",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - getOwner: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
})

// GetProxy gets the account proxy address (account that messages are forwarded to).
//
// On-chain: get fun getProxy(): address
var GetProxy = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "getProxy",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - getProxy: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
})

// GetBeneficiaries gets the set of addresses that are allowed to withdraw jettons from this
// account's wallet.
//
// On-chain: get fun getBeneficiaries(): map<address, ()>
var GetBeneficiaries = tvm.NewNoArgsGetter(tvm.NoArgsOpts[map[*address.Address]struct{}]{
	Name: "getBeneficiaries",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (map[*address.Address]struct{}, error) {
		beneficiariesCell, err := r.Cell(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Cell(0) - getBeneficiaries: %w", err)
		}

		cs := beneficiariesCell.BeginParse()
		dict, err := cs.LoadDict(267) // address keys use 267 bits
		if err != nil {
			return nil, fmt.Errorf("error loading dict - getBeneficiaries: %w", err)
		}

		tlbeDict, err := tlbe.NewDictFromDictionary[*address.Address, struct{}](dict)
		if err != nil {
			return nil, fmt.Errorf("error converting dict to tlbe.Dict - getBeneficiaries: %w", err)
		}

		return tlbeDict.AsMap(), nil
	}),
})
