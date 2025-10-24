package mcms

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	mcms.SetRoot{},
	mcms.Execute{},
	mcms.SetConfig{},
	mcms.SubmitErrorReport{},
	mcms.TransferOracleRole{},
	mcms.NewRoot{},
	mcms.ConfigSet{},
	mcms.OpExecuted{},
	mcms.ErrorReportSubmitted{},
	mcms.OracleRoleTransferred{},
})

type decoder struct{}

func NewDecoder() lib.ContractDecoder {
	return &decoder{}
}

func (d *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.chainlink.ton.mcms.MCMS")
}

func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs)
}

// TODO: implement exit code descriptions for MCMS
// Notice: tvm.ExitCode is not the right type to use (these are low-level TVM exit codes),
// we should define our own ExitCode type for our contracts
func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return "", &lib.UnknownMessageError{}
}
