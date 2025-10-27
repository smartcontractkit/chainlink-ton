package jetton

import (
	"fmt"
	"slices"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const (
	OpcodeTopUp = 0xd372158c
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	set := []ExitCode{
		ErrorInvalidOp,
		ErrorWrongOp,
		ErrorNotOwner,
		ErrorNotValidWallet,
		ErrorWrongWorkchain,
	}
	idx := slices.IndexFunc(set, func(v ExitCode) bool { return ExitCode(ec) == v })
	if idx < 0 {
		return 0, fmt.Errorf("invalid exit code: %d", ec)
	}
	return ExitCode(ec), nil
}

const (
	ErrorInvalidOp      ExitCode = 72
	ErrorWrongOp        ExitCode = 0xffff
	ErrorNotOwner       ExitCode = 73
	ErrorNotValidWallet ExitCode = 74
	ErrorWrongWorkchain ExitCode = 333
)

// For funding the contract with TON
type TopUpMessage struct {
	_       tlb.Magic `tlb:"#d372158c"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}
