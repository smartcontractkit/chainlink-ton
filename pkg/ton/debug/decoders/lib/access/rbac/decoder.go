package rbac

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = rbac.TLBs

type decoder struct {
	tlbsCtx lib.TLBMap
}

func NewDecoder(tlbsCtx lib.TLBMap) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

func (d *decoder) ContractType() string {
	return "com.chainlink.ton.lib.access.RBAC"
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
	ec, err := rbac.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", &lib.UnknownMessageError{}
	}

	return ec.String(), nil
}
