package chainaccessor

import (
	// "math/big"

	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	// "github.com/xssnick/tonutils-go/address"
	// "github.com/xssnick/tonutils-go/tvm/cell"

	// "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

// TODO: remove, cherrypicked
// type CCIPMessageSent struct {
// 	Message TVM2AnyRampMessage `tlb:"^"`
// }

// type TVM2AnyRampMessage struct {
// 	Header        RampMessageHeader      `tlb:"."`
// 	Sender        *address.Address       `tlb:"addr"`
// 	Body          TVM2AnyRampMessageBody `tlb:"^"`
// 	FeeValueJuels *big.Int               `tlb:"## 96"`
// }

// type RampMessageHeader struct {
// 	MessageID           []byte `tlb:"bits 256"`
// 	SourceChainSelector uint64 `tlb:"## 64"`
// 	DestChainSelector   uint64 `tlb:"## 64"`
// 	SequenceNumber      uint64 `tlb:"## 64"`
// 	Nonce               uint64 `tlb:"## 64"`
// }

// type TVM2AnyRampMessageBody struct {
// 	Receiver       common.CrossChainAddress `tlb:"^"`
// 	Data           common.SnakeBytes        `tlb:"^"`
// 	ExtraArgs      *cell.Cell               `tlb:"^"` // TODO: common.SnakeRef[TVM2AnyTokenTransfer] once defined
// 	TokenAmounts   *cell.Cell               `tlb:"^"`
// 	FeeToken       *address.Address         `tlb:"addr"`
// 	FeeTokenAmount *big.Int                 `tlb:"## 256"`
// }

// ToGenericSendRequestedEvent converts a TON CCIPSend message to a generic CCIP message
func ToGenericSendRequestedEvent(
	tonEvent *onramp.CCIPMessageSent,
	srcChainSelector ccipocr3.ChainSelector,
) (*chainaccessor.SendRequestedEvent, error) {
	// create the generic CCIP message
	// var messageID ccipocr3.Bytes32
	// copy(messageID[:], tonEvent.Message.Header.MessageID)

	msg := ccipocr3.Message{
		// Header: ccipocr3.RampMessageHeader{
		// 	MessageID:           messageID,
		// 	SourceChainSelector: srcChainSelector,
		// 	DestChainSelector:   ccipocr3.ChainSelector(tonEvent.Message.Header.DestChainSelector),
		// 	SequenceNumber:      ccipocr3.SeqNum(tonEvent.Message.Header.SequenceNumber),
		// 	Nonce:               tonEvent.Message.Header.Nonce,
		// },
		// Sender:         ccipocr3.UnknownAddress(tonEvent.Message.Sender.String()),
		// Data:           ccipocr3.Bytes(tonEvent.Message.Body.Data),
		// Receiver:       ccipocr3.UnknownAddress(tonEvent.Message.Body.Receiver),
		// ExtraArgs:      tonEvent.Message.Body.ExtraArgs.ToBOC(),
		// FeeToken:       ccipocr3.UnknownAddress(tonEvent.Message.Body.FeeToken.String()),
		// FeeTokenAmount: ccipocr3.NewBigInt(tonEvent.Message.Body.FeeTokenAmount),
		// FeeValueJuels:  ccip3.BigInt{}, // TODO: conversion
		// TokenAmounts:   tokenAmounts, // TODO
	}

	genericEvent := &chainaccessor.SendRequestedEvent{
		DestChainSelector: msg.Header.DestChainSelector,
		SequenceNumber:    msg.Header.SequenceNumber,
		Message:           msg,
	}

	return genericEvent, nil
}
