package timelock

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	timelock.Init{},
	timelock.ScheduleBatch{},
	timelock.Cancel{},
	timelock.ExecuteBatch{},
	timelock.UpdateDelay{},
	timelock.UpdateOpFinalizationTimeout{},
	timelock.BlockFunctionSelector{},
	timelock.UnblockFunctionSelector{},
	timelock.BypasserExecuteBatch{},
	timelock.UpdateExecutorRoleCheck{},
	timelock.SubmitErrorReport{},
	timelock.CallScheduled{},
	timelock.CallExecuted{},
	timelock.BypasserCallExecuted{},
	timelock.Cancelled{},
	timelock.MinDelayChange{},
	timelock.FunctionSelectorBlocked{},
	timelock.FunctionSelectorUnblocked{},
	timelock.ExecutorRoleCheckUpdated{},
})

type decoder struct {
	tlbsCtx map[uint64]interface{}
}

func NewDecoder(tlbsCtx map[uint64]interface{}) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

func (d *decoder) ContractType() string {
	return "com.chainlink.ton.mcms.Timelock"
}

func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs, d.tlbsCtx)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	ec, err := timelock.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", &lib.UnknownMessageError{}
	}

	return ec.String(), nil
}
