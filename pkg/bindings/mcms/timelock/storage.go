package timelock

import (
	"math/big"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
)

func EmptyDataFrom(id uint32) Data {
	return Data{
		ID:                       id,
		MinDelay:                 0,
		Timestamps:               tlbe.NewEmptyDict[*tlbe.Uint256, uint64](),
		BlockedFnSelectorsLen:    0,
		BlockedFnSelectors:       tlbe.NewEmptyDict[uint32, bool](),
		ExecutorRoleCheckEnabled: true,
		OpPendingInfo: OpPendingInfo{
			ValidAfter:            0,
			OpFinalizationTimeout: 0,
			OpPendingID:           tlbe.NewUint256(big.NewInt(0)),
			OpPendingCalls:        tlbe.NewEmptyDict[*tlbe.Uint256, bool](),
		},
		RBAC: rbac.Data{
			Roles: tlbe.NewEmptyDict[*tlbe.Uint256, rbac.RoleData](),
		},
	}
}
