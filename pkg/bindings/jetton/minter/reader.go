package minter

import (
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// GetWalletAddress computes the jetton wallet address for a given owner.
//
// On-chain: get fun get_wallet_address(ownerAddress: address): address
var GetWalletAddress = tvm.Getter[*address.Address, *address.Address]{
	Name: "get_wallet_address",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - get_wallet_address: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
}
