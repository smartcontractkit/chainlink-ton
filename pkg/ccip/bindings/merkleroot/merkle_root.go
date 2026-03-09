package merkleroot

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// Validate represents the MerkleRoot_Validate message.
type Validate struct {
	_                                       tlb.Magic              `tlb:"#038ede91" json:"-"` //nolint:revive // Ignore opcode tag
	Message                                 ocr.Any2TVMRampMessage `tlb:"^"`
	PermissionlessExecutionThresholdSeconds uint32                 `tlb:"## 32"`
	MetadataHash                            *big.Int               `tlb:"## 256"`
	GasOverride                             *tlb.Coins             `tlb:"maybe ."`
}

// MarkState represents the MerkleRoot_MarkState message.
type MarkState struct {
	_      tlb.Magic `tlb:"#019f4cd2" json:"-"` //nolint:revive // Ignore opcode tag
	SeqNum uint64    `tlb:"## 64"`
	State  uint8     `tlb:"## 8"`
}

type Storage struct {
	Root                  *big.Int         `tlb:"## 256"`
	Owner                 *address.Address `tlb:"addr"`
	Timestamp             uint64           `tlb:"## 64"`
	MinMsgNr              uint64           `tlb:"## 64"`
	MaxMsgNr              uint64           `tlb:"## 64"`
	MessageStates         *big.Int         `tlb:"## 128"`
	DeliveredMessageCount uint16           `tlb:"## 16"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	Validate{},
	MarkState{},
}).MustWithStorageType(Storage{})

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorAlreadyExecuted)
		ecMax = int32(ErrorSeqNumOutOfBounds)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorAlreadyExecuted ExitCode = iota + 18600 // Facility ID * 100
	ErrorNotOwner
	ErrorManualExecutionNotYetEnabled
	ErrorSkippedAlreadyExecutedMessage
	ErrorInvalidState
	ErrorSeqNumOutOfBounds
)
