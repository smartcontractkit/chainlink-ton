package wallet

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	jetton_common "github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/decoders/jetton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = wallet.TLBs

type decoder struct {
	tlbsCtx tvm.TLBMap
}

func NewDecoder(tlbsCtx tvm.TLBMap) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() string {
	return "com.github.ton-blockchain.jetton-contract.contracts.jetton-wallet"
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
	// TODO: use lib.Wrapper to describe generic payloads
	info, err := lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs, d.tlbsCtx)
	if err != nil {
		return jetton_common.NewDecoder(d.tlbsCtx, d.ContractType()).InternalMessageInfo(msg)
	}

	return info, nil
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	ec, err := wallet.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return jetton_common.NewDecoder(d.tlbsCtx, d.ContractType()).ExitCodeInfo(exitCode)
	}

	return ec.String(), nil
}
