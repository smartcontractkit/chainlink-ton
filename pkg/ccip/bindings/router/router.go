package router

import (
	"math/big"
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenregistry"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var (
	OpcodeApplyRampUpdates   = tvm.MustExtractMagic(reflect.TypeFor[ApplyRampUpdates]())
	OpcodeCCIPSend           = tvm.MustExtractMagic(reflect.TypeFor[CCIPSend]())
	OpcodeRouteMessage       = tvm.MustExtractMagic(reflect.TypeFor[RouteMessage]())
	OpcodeCCIPReceiveConfirm = tvm.MustExtractMagic(reflect.TypeFor[CCIPReceiveConfirm]())
	OpcodeMessageSent        = tvm.MustExtractMagic(reflect.TypeFor[MessageSent]())
	OpcodeMessageRejected    = tvm.MustExtractMagic(reflect.TypeFor[MessageRejected]())
	OpcodeRMNRemoteCurse     = tvm.MustExtractMagic(reflect.TypeFor[RMNRemoteCurse]())
	OpcodeRMNRemoteUncurse   = tvm.MustExtractMagic(reflect.TypeFor[RMNRemoteUncurse]())
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
		ecMax = int32(ErrorInsufficientFee)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorDestChainNotEnabled ExitCode = ExitCode(57100 + iota)
	ErrorSourceChainNotEnabled
	SenderIsNotOffRamp
	OffRampNotSetForSelector
	OffRampAddressMismatch
	ErrorSubjectCursed
	ErrorNotOnRamp
	ErrorMissingTokenAmounts
	ErrorNoMultiTokenTransfers
	ErrorInsufficientFee
)

type Storage struct {
	ID                      uint32                  `tlb:"## 32"`
	Ownable                 ownable2step.Storage    `tlb:"."`
	WrappedNative           *address.Address        `tlb:"addr"`
	OnRamps                 *cell.Dictionary        `tlb:"dict 64"`
	OffRamps                *cell.Dictionary        `tlb:"dict 64"`
	RMNRemote               RMNRemote               `tlb:"^"`
	TokenRegistryDeployment TokenRegistryDeployment `tlb:"^"`
}

type RMNRemote struct {
	Admin          ownable2step.Storage `tlb:"."`
	CursedSubjects *cell.Dictionary     `tlb:"dict 128"`
	ForwardUpdates *cell.Dictionary     `tlb:"dict 267"`
}

type TokenRegistryDeployment struct {
	DeployableCode    *cell.Cell `tlb:"^"`
	TokenRegistryCode *cell.Cell `tlb:"^"`
}

// ChainSelector is a wrapper uint64 to support SnakedCell encoding.
type ChainSelector struct {
	Value uint64 `tlb:"## 64"`
}

// Subject is a wrapper for uint128 to support SnakedCell encoding.
// Stored as *big.Int since Go doesn't have native uint128.
type Subject struct {
	Value *big.Int `tlb:"## 128"`
}

// crc32("ApplyRampUpdates")
type ApplyRampUpdates struct {
	_              tlb.Magic `tlb:"#7db6745d" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID        uint64    `tlb:"## 64"`
	OnRampUpdates  *OnRamps  `tlb:"maybe ."`
	OffRampAdds    *OffRamps `tlb:"maybe ."`
	OffRampRemoves *OffRamps `tlb:"maybe ."`
}

type OnRamps struct {
	DestChainSelectors common.SnakedCell[ChainSelector] `tlb:"^"`
	OnRamps            *address.Address                 `tlb:"addr"`
}

type OffRamps struct {
	SourceChainSelectors common.SnakedCell[ChainSelector] `tlb:"^"`
	OffRamp              *address.Address                 `tlb:"addr"`
}

// TokenAmount is a structure that holds the amount and token address for a CCIP transaction.
type TokenAmount struct {
	Amount tlb.Coins        `tlb:"."`
	Token  *address.Address `tlb:"addr"`
}

type CCIPSend struct {
	_                 tlb.Magic                      `tlb:"#31768d95" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID           uint64                         `tlb:"## 64"`
	DestChainSelector uint64                         `tlb:"## 64"`
	Receiver          common.CrossChainAddress       `tlb:"."`
	Data              common.SnakeBytes              `tlb:"^"`
	TokenAmounts      common.SnakedCell[TokenAmount] `tlb:"^"`
	FeeToken          *address.Address               `tlb:"addr"`
	ExtraArgs         *cell.Cell                     `tlb:"^"`
}

type RouteMessage struct {
	_        tlb.Magic              `tlb:"#fc69c50b" json:"-"` //nolint:revive // Ignore opcode tag
	Message  offramp.Any2TVMMessage `tlb:"^"`
	ExecID   *big.Int               `tlb:"## 192"`
	Receiver *address.Address       `tlb:"addr"`
	GasLimit tlb.Coins              `tlb:"."`
}

type CCIPReceiveConfirm struct {
	_      tlb.Magic `tlb:"#1e55bbf6" json:"-"` //nolint:revive // Ignore opcode tag
	ExecID *big.Int  `tlb:"## 192"`
}

type MessageSent struct {
	_                 tlb.Magic        `tlb:"#6513f8e1" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID           uint64           `tlb:"## 64"`
	MessageID         *big.Int         `tlb:"## 256"`
	DestChainSelector uint64           `tlb:"## 64"`
	Sender            *address.Address `tlb:"addr"`
}

type MessageRejected struct {
	_                 tlb.Magic        `tlb:"#8ae25114" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID           uint64           `tlb:"## 64"`
	DestChainSelector uint64           `tlb:"## 64"`
	Sender            *address.Address `tlb:"addr"`
	Error             *big.Int         `tlb:"## 256"`
}

type CCIPSendACK struct {
	_         tlb.Magic `tlb:"#78d0f21e" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID   uint64    `tlb:"## 64"`
	MessageID *big.Int  `tlb:"## 256"`
}

type CCIPSendNACK struct {
	_       tlb.Magic `tlb:"#5a45d434" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID uint64    `tlb:"## 64"`
	Error   *big.Int  `tlb:"## 256"`
}

// RMNRemoteCurse message type for cursing subjects on the router.
type RMNRemoteCurse struct {
	_        tlb.Magic                  `tlb:"#f3388046" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID  uint64                     `tlb:"## 64"`
	Subjects common.SnakedCell[Subject] `tlb:"^"`
}

// RMNRemoteUncurse message type for uncursing subjects on the router.
type RMNRemoteUncurse struct {
	_        tlb.Magic                  `tlb:"#3f153a31" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID  uint64                     `tlb:"## 64"`
	Subjects common.SnakedCell[Subject] `tlb:"^"`
}

type TokenRegistrySetTokenInfo struct {
	_            tlb.Magic               `tlb:"#fed7cfba" json:"-"` //nolint:revive // Ignore opcode tag
	TokenAddress *address.Address        `tlb:"addr"`
	TokenInfo    tokenregistry.TokenInfo `tlb:"."`
	IsNewEntry   bool                    `tlb:"bool"`
}

type RMNOwnableMessage[T ownable2step.InMessage | any] struct {
	_       tlb.Magic                 `tlb:"#af7a9ac6" json:"-"` //nolint:revive // Ignore opcode tag
	Content *codec.MessageEnvelope[T] `tlb:"."`
}

var TLBs = tvm.MustNewTLBMap([]any{
	ApplyRampUpdates{},
	CCIPSend{},
	RouteMessage{},
	CCIPReceiveConfirm{},
	CCIPSendACK{},
	CCIPSendNACK{},
	MessageSent{},
	MessageRejected{},
	RMNRemoteCurse{},
	RMNRemoteUncurse{},
	TokenRegistrySetTokenInfo{},
	// Notice: T as any to register once for all generic instances of RMNOwnableMessage
	RMNOwnableMessage[any]{Content: nil},
}).MustWithStorageType(Storage{})
