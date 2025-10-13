package evm

import (
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_2_0/router"
)

// MessageReceivedEvent represents the MessageReceived event structure
type MessageReceivedEvent struct {
	MessageID           [32]byte
	SourceChainSelector uint64
	Sender              []byte
	Data                []byte
	DestTokenAmounts    []router.ClientEVMTokenAmount
}
