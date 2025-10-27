package timelock

import (
	"maps"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

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
	tlbs map[uint64]interface{}
}

func NewDecoder(tlbsCtx map[uint64]interface{}) lib.ContractDecoder {
	tlbs := maps.Clone(tlbsCtx)
	maps.Copy(tlbs, TLBs)
	return &decoder{tlbs}
}

func (d *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.chainlink.ton.mcms.Timelock")
}

func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, d.tlbs)
}

// TODO: implement exit code descriptions for MCMS
// Notice: tvm.ExitCode is not the right type to use (these are low-level TVM exit codes),
// we should define our own ExitCode type for our contracts
func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return "", &lib.UnknownMessageError{}
}
