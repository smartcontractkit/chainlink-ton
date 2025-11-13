package mcms

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	mcms.SetRoot{},
	mcms.Execute{},
	mcms.SetConfig{},
	mcms.UpdateOpFinalizationTimeout{},
	mcms.SubmitErrorReport{},
	mcms.TransferOracleRole{},
	mcms.NewRoot{},
	mcms.ConfigSet{},
	mcms.OpExecuted{},
	mcms.ErrorReportSubmitted{},
	mcms.OracleRoleTransferred{},
})

type decoder struct {
	tlbsCtx map[uint64]interface{}
}

func NewDecoder(tlbsCtx map[uint64]interface{}) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

func (d *decoder) ContractType() string {
	return "com.chainlink.ton.mcms.MCMS"
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
	ec, err := mcms.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", &lib.UnknownMessageError{}
	}

	return ec.String(), nil
}
