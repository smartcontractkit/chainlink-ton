package ccipcommon

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type decoder struct {
	tlbsCtx tvm.TLBMap
}

func NewDecoder(tlbsCtx tvm.TLBMap) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() string {
	return bindings.PkgCCIP
}

// EventInfo implements lib.ContractDecoder.
func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}

// ExitCodeInfo implements lib.ContractDecoder.
func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return "", codec.ErrUnknownMessage
}

// ExternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) ExternalMessageInfo(body *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}

// InternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) InternalMessageInfo(body *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}
