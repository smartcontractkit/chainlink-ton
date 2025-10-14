package wallet

import (
	"errors"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	jetton_common "github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/jetton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type decoder struct {
	payloadDecoders map[cldf.ContractType]lib.ContractDecoder
}

func NewDecoder(payloadDecoders map[cldf.ContractType]lib.ContractDecoder) lib.ContractDecoder {
	return &decoder{payloadDecoders}
}

// ContractType implements lib.ContractDecoder.
func (j *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.github.ton-blockchain.jetton-contract.contracts.jetton-wallet")
}

// EventInfo implements lib.ContractDecoder.
func (j *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// ExternalMessageInfo implements lib.ContractDecoder.
func (j *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// InternalMessageInfo implements lib.ContractDecoder.
func (j *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	r := msg.BeginParse()
	if r.BitsLeft() == 0 {
		return nil, &lib.UnknownMessageError{}
	}
	opCode, err := r.PreloadUInt(32)
	if err != nil {
		return nil, err
	}
	switch opCode {
	case wallet.OpcodeWalletTransfer:
		var askToTransfer wallet.AskToTransfer
		err := tlb.LoadFromCell(&askToTransfer, r)
		if err != nil {
			return nil, err
		}
		if askToTransfer.CustomPayload == nil {
			return lib.NewMessageInfo("AskToTransfer", askToTransfer)
		}

		payloadInfo, err := j.tryDecodePayload(askToTransfer.CustomPayload)
		if err == nil {
			return lib.NewMessageInfo("AskToTransferWithPayload", AskToTransferMessageDescription{
				QueryID:             askToTransfer.QueryID,
				Amount:              askToTransfer.Amount,
				Destination:         askToTransfer.Destination,
				ResponseDestination: askToTransfer.ResponseDestination,
				CustomPayload:       askToTransfer.CustomPayload,
				ForwardTonAmount:    askToTransfer.ForwardTonAmount,
				ForwardPayload:      lib.Wrapper{Type: payloadInfo.Name(), Value: payloadInfo.Body()},
			})
		}
	case wallet.OpcodeWalletInternalTransfer:
		var internalTransfer wallet.InternalTransferMessage
		err := tlb.LoadFromCell(&internalTransfer, r)
		if err != nil {
			return nil, err
		}
		if internalTransfer.ForwardPayload == nil {
			return lib.NewMessageInfo("InternalTransfer", internalTransfer)
		}

		payloadInfo, err := j.tryDecodePayload(internalTransfer.ForwardPayload)
		if err == nil {
			return lib.NewMessageInfo("InternalTransferWithPayload", InternalTransferDescription(internalTransfer, payloadInfo))
		}
	}
	return jetton_common.NewDecoder().InternalMessageInfo(msg)
}

func InternalTransferDescription(internalTransfer wallet.InternalTransferMessage, payloadInfo lib.MessageInfo) InternalTransferMessageDescription {
	return InternalTransferMessageDescription{
		QueryID:          internalTransfer.QueryID,
		Amount:           internalTransfer.Amount,
		From:             internalTransfer.From,
		ResponseAddress:  internalTransfer.ResponseAddress,
		ForwardTonAmount: internalTransfer.ForwardTonAmount,
		ForwardPayload:   lib.Wrapper{Type: payloadInfo.Name(), Value: payloadInfo.Body()},
	}
}

func (j *decoder) tryDecodePayload(payloadCell *cell.Cell) (lib.MessageInfo, error) {
	for _, d := range j.payloadDecoders {
		info, err := d.InternalMessageInfo(payloadCell)
		if err == nil {
			return info, nil
		}
		if e := &(lib.UnknownMessageError{}); !errors.As(err, &e) {
			return nil, err
		}
	}
	return nil, &lib.UnknownMessageError{}
}

type AskToTransferMessageDescription struct {
	QueryID             uint64
	Amount              tlb.Coins
	Destination         *address.Address
	ResponseDestination *address.Address
	CustomPayload       *cell.Cell
	ForwardTonAmount    tlb.Coins
	ForwardPayload      any
}

type InternalTransferMessageDescription struct {
	QueryID          uint64
	Amount           tlb.Coins
	From             *address.Address
	ResponseAddress  *address.Address
	ForwardTonAmount tlb.Coins
	ForwardPayload   any
}

func (j *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	switch exitCode {
	case wallet.BalanceError:
		return "BalanceError", nil
	case wallet.NotEnoughGas:
		return "NotEnoughGas", nil
	case wallet.InvalidMessage:
		return "InvalidMessage", nil
	default:
		return jetton_common.NewDecoder().ExitCodeInfo(exitCode)
	}
}
