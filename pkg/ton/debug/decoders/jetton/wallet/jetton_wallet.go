package wallet

import (
	"maps"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	jetton_common "github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/jetton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	wallet.AskToTransfer{},
	wallet.InternalTransferMessage{},
	wallet.TransferNotification{},
})

type decoder struct {
	tlbs map[uint64]interface{}
}

func NewDecoder(tlbsCtx map[uint64]interface{}) lib.ContractDecoder {
	tlbs := maps.Clone(tlbsCtx)
	maps.Copy(tlbs, TLBs)
	return &decoder{tlbs}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.github.ton-blockchain.jetton-contract.contracts.jetton-wallet")
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
	// TODO: use lib.Wrapper to describe generic payloads
	info, err := lib.NewMessageInfoFromCell(d.ContractType(), msg, d.tlbs)
	if err != nil {
		return jetton_common.NewDecoder(d.tlbs, d.ContractType()).InternalMessageInfo(msg)
	}
	return info, nil
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	ec, err := wallet.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return jetton_common.NewDecoder(d.tlbs, d.ContractType()).ExitCodeInfo(exitCode)
	}

	return ec.String(), nil
}
