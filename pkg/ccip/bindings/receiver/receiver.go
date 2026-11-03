package receiver

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	ccipcommon "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
)

type Behavior uint8

const (
	BehaviorAccept Behavior = iota
	BehaviorRejectAll
	BehaviorConsumeAllGas
)

// Storage represents the storage structure for the CCIP receiver contract.
type Storage struct {
	ID               uint32               `tlb:"## 32"`
	Ownable          ownable2step.Storage `tlb:"."`
	AuthorizedCaller *address.Address     `tlb:"addr"`
	Behavior         Behavior             `tlb:"## 8"`
}

type UpdateBehavior struct {
	_        tlb.Magic `tlb:"#cf87a147" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	Behavior Behavior  `tlb:"## 8"`
}

type UpdateAuthorizedCaller struct {
	_                tlb.Magic        `tlb:"#9f5e489f" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	AuthorizedCaller *address.Address `tlb:"addr"`
}

// CCIPMessageReceivedEventTopic is the event topic for Receiver_CCIPMessageReceived event
// crc32('Receiver_CCIPMessageReceived') = 0xc5a40ab3
const CCIPMessageReceivedEventTopic = 0xc5a40ab3

// CCIPMessageReceived represents the Receiver_CCIPMessageReceived event emitted by the receiver
// contract. Older receivers emitted the whole message, whose layout starts with the same fields.
type CCIPMessageReceived struct {
	MessageID           []byte                       `tlb:"bits 256"`
	SourceChainSelector uint64                       `tlb:"## 64"`
	Sender              ccipcommon.CrossChainAddress `tlb:"."`
}
