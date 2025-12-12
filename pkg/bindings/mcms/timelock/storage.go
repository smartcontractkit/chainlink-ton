package timelock

import (
	"math/big"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
)

func EmptyDataFrom(id uint32) Data {
	return Data{
		ID:                       id,
		MinDelay:                 0,
		Timestamps:               cell.NewDict(256),
		BlockedFnSelectorsLen:    0,
		BlockedFnSelectors:       cell.NewDict(32),
		ExecutorRoleCheckEnabled: true,
		OpPendingInfo: OpPendingInfo{
			ValidAfter:            0,
			OpFinalizationTimeout: 0,
			OpPendingID:           tlbe.NewUint256(big.NewInt(0)),
		},
		RBAC: rbac.Data{
			Roles: cell.NewDict(256),
		},
	}
}
