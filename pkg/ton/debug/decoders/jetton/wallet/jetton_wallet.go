package wallet

import (
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
	payloadDecoders map[cldf.ContractType]lib.ContractDecoder
}

func NewDecoder(payloadDecoders map[cldf.ContractType]lib.ContractDecoder) lib.ContractDecoder {
	return &decoder{payloadDecoders}
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
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs)
	// TODO: compose with common decoder
	// return jetton_common.NewDecoder(d.ContractType()).InternalMessageInfo(msg)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	switch exitCode {
	case wallet.BalanceError:
		return "BalanceError", nil
	case wallet.NotEnoughGas:
		return "NotEnoughGas", nil
	case wallet.InvalidMessage:
		return "InvalidMessage", nil
	default:
		return jetton_common.NewDecoder(d.ContractType()).ExitCodeInfo(exitCode)
	}
}
