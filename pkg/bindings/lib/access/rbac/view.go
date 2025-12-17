package rbac

import (
	"context"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// GetRoleMembersView retrieves all addresses assigned to a specific role in the RBAC contract.
func GetRoleMembersView(ctx context.Context, client ton.APIClientWrapped, addr *address.Address, role *big.Int) ([]*address.Address, error) {
	block, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	n, err := tvm.CallGetter(ctx, client, block, addr, GetRoleMemberCount, role)
	if err != nil {
		return nil, err
	}

	// For each address index in the roles count, get the address
	addresses := make([]*address.Address, 0, n)
	for j := range n {
		args := GetRoleMemberArgs{
			Role:  role,
			Index: j,
		}
		rmAddr, err := tvm.CallGetter(ctx, client, block, addr, GetRoleMember, args)
		if err != nil {
			return nil, err
		}
		addresses = append(addresses, rmAddr)
	}

	return addresses, nil
}
