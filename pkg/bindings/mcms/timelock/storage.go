package timelock

import (
	"errors"
	"math/big"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
)

func EmptyDataFrom(id uint32, initializer *address.Address) (Data, error) {
	if initializer == nil || initializer.IsAddrNone() {
		return Data{}, errors.New("timelock initializer is required")
	}

	return Data{
		ID:                       id,
		Initializer:              initializer,
		MinDelay:                 0,
		Timestamps:               tlbe.NewEmptyDict[tlbe.Uint256, uint64](),
		BlockedFnSelectorsLen:    0,
		BlockedFnSelectors:       tlbe.NewEmptyDict[uint32, bool](),
		ExecutorRoleCheckEnabled: true,
		OpPendingInfo: OpPendingInfo{
			ValidAfter:            0,
			OpFinalizationTimeout: 0,
			OpPendingID:           tlbe.NewUint256(big.NewInt(0)),
			OpPendingCalls:        tlbe.NewEmptyDict[tlbe.Uint256, bool](),
		},
		RBAC: rbac.Data{
			Roles: tlbe.NewEmptyDict[tlbe.Uint256, rbac.RoleRef](),
		},
	}, nil
}
