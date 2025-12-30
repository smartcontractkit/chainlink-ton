package receiver

import (
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
)

type Behavior uint8

const (
	Accept Behavior = iota
	RejectAll
	ConsumeAllGas
)

// Storage represents the storage structure for the CCIP receiver contract.
type Storage struct {
	ID               uint32               `tlb:"## 32"`
	Ownable          ownable2step.Storage `tlb:"."`
	AuthorizedCaller *address.Address     `tlb:"addr"`
	Behavior         Behavior             `tlb:"## 8"`
}

// CCIPMessageReceivedEventTopic is the event topic for Receiver_CCIPMessageReceived event
// crc32('Receiver_CCIPMessageReceived') = 0xc5a40ab3
const CCIPMessageReceivedEventTopic = 0xc5a40ab3

// CCIPMessageReceived represents the Receiver_CCIPMessageReceived event emitted by the receiver contract
type CCIPMessageReceived struct {
	Message offramp.Any2TVMMessage `tlb:"."`
}
