package router

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const (
	OpcodeSetRamps           = 0x20272c81
	OpcodeCCIPSend           = 0x31768d95
	OpcodeUpdateOffRamps     = 0x234110a7
	OpcodeRouteMessage       = 0xfc69c50b
	OpcodeCCIPReceiveConfirm = 0x1e55bbf6
	OpcodeMessageSent        = 0x6513f8e1
	OpcodeMessageRejected    = 0x8ae25114
)

const (
	OutgoingOpcodeCCIPSendACK  = 0x78d0f21e
	OutgoingOpcodeCCIPSendNACK = 0x5a45d434
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorDestChainNotEnabled)
		ecMax = int32(ErrorUnknownMessage)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorDestChainNotEnabled ExitCode = iota + ExitCode(49600)
	ErrorSourceChainNotEnabled
	SenderIsNotOffRamp
	OffRampNotSetForSelector
	OffRampAddressMismatch

	ErrorUnknownMessage ExitCode = ExitCode(0x1002)
)

type Storage struct {
	ID        uint32              `tlb:"## 32"`
	Ownable   common.Ownable2Step `tlb:"."`
	OnRamps   *cell.Dictionary    `tlb:"dict 64"`
	OffRamps  *cell.Dictionary    `tlb:"dict 64"`
	RMNRemote RMNRemote           `tlb:"^"`
}

type RMNRemote struct {
	Admin          common.Ownable2Step `tlb:"."`
	CursedSubjects *cell.Dictionary    `tlb:"dict 128"`
	ForwardUpdates *cell.Dictionary    `tlb:"dict addr"`
}

// ChainSelector is a wrapper uint64 to support SnakeData encoding.
type ChainSelector struct {
	Value uint64 `tlb:"## 64"`
}

type SetRamps struct {
	_                  tlb.Magic                       `tlb:"#20272c81"` //nolint:revive // Ignore opcode tag
	QueryID            uint64                          `tlb:"## 64"`
	DestChainSelectors common.SnakeData[ChainSelector] `tlb:"^"`
	OnRamps            *address.Address                `tlb:"addr"`
}

type UpdateOffRamps struct {
	_                         tlb.Magic                       `tlb:"#234110a7"` //nolint:revive // Ignore opcode tag
	QueryID                   uint64                          `tlb:"## 64"`
	SourceChainSelectorAdd    common.SnakeData[ChainSelector] `tlb:"^"`
	OffRampAdd                *address.Address                `tlb:"maybe addr"`
	SourceChainSelectorRemove common.SnakeData[ChainSelector] `tlb:"^"`
	OffRampRemove             *address.Address                `tlb:"maybe addr"`
}

// TokenAmount is a structure that holds the amount and token address for a CCIP transaction.
type TokenAmount struct {
	Amount *big.Int        `tlb:"## 256"`
	Token  address.Address `tlb:"addr"`
}

type CCIPSend struct {
	_                 tlb.Magic                    `tlb:"#31768d95"` //nolint:revive // Ignore opcode tag
	QueryID           uint64                       `tlb:"## 64"`
	DestChainSelector uint64                       `tlb:"## 64"`
	Receiver          common.CrossChainAddress     `tlb:"."`
	Data              common.SnakeBytes            `tlb:"^"`
	TokenAmounts      common.SnakeRef[TokenAmount] `tlb:"^"`
	FeeToken          *address.Address             `tlb:"addr"`
	ExtraArgs         *cell.Cell                   `tlb:"^"`
}

// crc32("Router_RouteMessage")
type RouteMessage struct {
	_        tlb.Magic              `tlb:"#fc69c50b"` //nolint:revive // Ignore opcode tag
	Message  offramp.Any2TVMMessage `tlb:"^"`
	ExecID   big.Int                `tlb:"## 192"`
	Receiver *address.Address       `tlb:"addr"`
}

// crc32("Router_CCIPReceiveConfirm")
type CCIPReceiveConfirm struct {
	_      tlb.Magic `tlb:"#1e55bbf6"` //nolint:revive // Ignore opcode tag
	ExecID big.Int   `tlb:"## 192"`
}

// 0x6513f8e1 = crc32b("Router_MessageSent")
type MessageSent struct {
	_                 tlb.Magic        `tlb:"#6513f8e1"` //nolint:revive // Ignore opcode tag
	QueryID           uint64           `tlb:"## 64"`
	MessageID         big.Int          `tlb:"## 256"`
	DestChainSelector uint64           `tlb:"## 64"`
	Sender            *address.Address `tlb:"addr"`
}

type MessageRejected struct {
	_                 tlb.Magic        `tlb:"#8ae25114"` //nolint:revive // Ignore opcode tag
	QueryID           uint64           `tlb:"## 64"`
	DestChainSelector uint64           `tlb:"## 64"`
	Sender            *address.Address `tlb:"addr"`
	Error             big.Int          `tlb:"## 256"`
}

type CCIPSendACK struct {
	_         tlb.Magic `tlb:"#78d0f21e"` //nolint:revive // Ignore opcode tag
	QueryID   uint64    `tlb:"## 64"`
	MessageID big.Int   `tlb:"## 256"`
}

type CCIPSendNACK struct {
	_       tlb.Magic `tlb:"#5a45d434"` //nolint:revive // Ignore opcode tag
	QueryID uint64    `tlb:"## 64"`
	Error   big.Int   `tlb:"## 256"`
}
