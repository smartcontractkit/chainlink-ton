package router

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = router.TLBs

type decoder struct {
	tlbsCtx tvm.TLBMap
}

func NewDecoder(tlbsCtx tvm.TLBMap) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

func (d *decoder) ContractType() string {
	return bindings.TypeRouter
}

func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}

func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}

func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs, d.tlbsCtx)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	ec, err := router.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", codec.ErrUnknownMessage
	}

	return ec.String(), nil
}
