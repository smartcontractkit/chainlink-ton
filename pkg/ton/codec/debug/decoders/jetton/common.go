package jetton

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/lib"
)

var TLBs = jetton.TLBs

type decoder struct {
	tlbsCtx tvm.TLBMap

	contractType tvm.FullyQualifiedName
}

func NewDecoder(tlbsCtx tvm.TLBMap, t tvm.FullyQualifiedName) lib.ContractDecoder {
	return &decoder{tlbsCtx: tlbsCtx, contractType: t}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() tvm.FullyQualifiedName {
	return d.contractType
}

// EventInfo implements lib.ContractDecoder.
func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}

// ExternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}

// InternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs, d.tlbsCtx)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	ec, err := jetton.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", codec.ErrUnknownMessage
	}

	return ec.String(), nil
}
