package merkleroot

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type Storage struct {
	Root                  *big.Int         `tlb:"## 256"`
	Owner                 *address.Address `tlb:"addr"`
	Timestamp             uint64           `tlb:"## 64"`
	MinMsgNr              uint64           `tlb:"## 64"`
	MaxMsgNr              uint64           `tlb:"## 64"`
	MessageStates         *big.Int         `tlb:"## 128"`
	DeliveredMessageCount uint16           `tlb:"## 16"`
}

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
