package router

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	router.ApplyRampUpdates{},
	router.CCIPSend{},
	router.RouteMessage{},
	router.CCIPReceiveConfirm{},
	router.CCIPSendACK{},
	router.CCIPSendNACK{},
	router.MessageSent{},
	router.MessageRejected{},
})

type decoder struct {
	tlbsCtx map[uint64]interface{}
}

func NewDecoder(tlbsCtx map[uint64]interface{}) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

func (d *decoder) ContractType() string {
	return "com.chainlink.ton.ccip.Router"
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
	ec, err := router.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", &lib.UnknownMessageError{}
	}

	return ec.String(), nil
}
