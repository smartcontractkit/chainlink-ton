package jetton

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	jetton.TopUpMessage{},
})

type decoder struct {
	tlbsCtx map[uint64]interface{}

	contractType string
}

func NewDecoder(tlbsCtx map[uint64]interface{}, t string) lib.ContractDecoder {
	return &decoder{tlbsCtx: tlbsCtx, contractType: t}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() string {
	return d.contractType
}

// EventInfo implements lib.ContractDecoder.
func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// ExternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// InternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs, d.tlbsCtx)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	ec, err := jetton.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", &lib.UnknownMessageError{}
	}

	return ec.String(), nil
}
