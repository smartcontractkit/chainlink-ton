package minter

import (
	"errors"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/minter"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/jetton/wallet"
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
	return cldf.ContractType("com.github.ton-blockchain.jetton-contract.contracts.jetton-minter")
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
	case minter.OpcodeMinterMint:
		var mint minter.MintMessage
		err := tlb.LoadFromCell(&mint, r)
		if err != nil {
			return nil, err
		}
		if mint.MasterMsg.ForwardPayload == nil {
			return lib.NewMessageInfo("Mint", mint)
		}

		payloadInfo, err := j.tryDecodePayload(mint.MasterMsg.ForwardPayload)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("MintWithPayload", MintMessageDescription{
			QueryID:     mint.QueryID,
			Destination: mint.Destination,
			TonAmount:   mint.TonAmount,
			MasterMsg:   wallet.InternalTransferDescription(mint.MasterMsg, payloadInfo),
		})
	case minter.OpcodeMinterChangeAdmin:
		var changeAdmin minter.ChangeAdminMessage
		err := tlb.LoadFromCell(&changeAdmin, r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("ChangeAdmin", changeAdmin)
	case minter.OpcodeMinterClaimAdmin:
		var changeContent minter.ClaimAdminMessage
		err := tlb.LoadFromCell(&changeContent, r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("ClaimAdmin", changeContent)
		// TODO missing messages
	}
	return jetton.NewDecoder().InternalMessageInfo(msg)
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

type MintMessageDescription struct {
	QueryID     uint64
	Destination *address.Address
	TonAmount   tlb.Coins
	MasterMsg   wallet.InternalTransferMessageDescription
}

func (j *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return jetton.NewDecoder().ExitCodeInfo(exitCode)
}
