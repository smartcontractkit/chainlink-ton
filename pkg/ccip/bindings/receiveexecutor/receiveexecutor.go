package receiveexecutor

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// InitExecute represents the ReceiveExecutor_InitExecute message.
type InitExecute struct {
	_                   tlb.Magic        `tlb:"#64cd2fd2" json:"-"` //nolint:revive // Ignore opcode tag
	GasOverride         *tlb.Coins       `tlb:"maybe ."`
	Root                *address.Address `tlb:"addr"`
	SequenceNumber      uint64           `tlb:"## 64"`
	SourceChainSelector uint64           `tlb:"## 64"`
	MessageID           *big.Int         `tlb:"## 256"`
}

// Confirm represents the ReceiveExecutor_Confirm message.
type Confirm struct {
	_        tlb.Magic        `tlb:"#00e5dd97" json:"-"` //nolint:revive // Ignore opcode tag
	Receiver *address.Address `tlb:"addr"`
}

// Bounced represents the ReceiveExecutor_Bounced message.
type Bounced struct {
	_        tlb.Magic        `tlb:"#05dee1bb" json:"-"` //nolint:revive // Ignore opcode tag
	Receiver *address.Address `tlb:"addr"`
}

// MessageState is the ReceiveExecutor message state machine state.
type MessageState uint8

const (
	MessageStateUntouched MessageState = iota
	MessageStateExecute
	MessageStateExecuteFailed
	MessageStateSuccess
)

// Storage represents ReceiveExecutor storage state.
type Storage struct {
	Owner                  *address.Address       `tlb:"addr"`
	Message                ocr.Any2TVMRampMessage `tlb:"^"`
	Root                   *address.Address       `tlb:"addr"`
	ExecID                 *big.Int               `tlb:"## 192"`
	State                  MessageState           `tlb:"## 8"`
	LastExecutionTimestamp uint64                 `tlb:"## 64"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	InitExecute{},
	Bounced{},
	Confirm{},
}).MustWithStorageType(Storage{})
