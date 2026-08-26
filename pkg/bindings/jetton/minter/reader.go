package minter

import (
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// GetWalletAddress computes the jetton wallet address for a given owner.
//
// On-chain: get fun get_wallet_address(ownerAddress: address): address
var GetWalletAddress = tvm.Getter[*address.Address, *address.Address]{
	Name: "get_wallet_address",
	Encoder: tvm.NewArgsEncoder(func(addr *address.Address) ([]any, error) {
		// Encode address as a cell slice (as expected by the contract)
		addrSlice := cell.BeginCell().MustStoreAddr(addr).EndCell().BeginParse()
		return []any{addrSlice}, nil
	}),
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - get_wallet_address: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
}
