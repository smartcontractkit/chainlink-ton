package jetton

import (
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

const (
	OpcodeTopUp = 0xd372158c
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	return tvm.NewExitCodeInSet(ExitCode(ec), []ExitCode{
		ErrorInvalidOp,
		ErrorWrongOp,
		ErrorNotOwner,
		ErrorNotValidWallet,
		ErrorWrongWorkchain,
	})
}

const (
	ErrorInvalidOp      ExitCode = 72
	ErrorWrongOp        ExitCode = 0xffff
	ErrorNotOwner       ExitCode = 73
	ErrorNotValidWallet ExitCode = 74
	ErrorWrongWorkchain ExitCode = 333
)

// For funding the contract with TON.
type TopUpTons struct {
	_ tlb.Magic `tlb:"#d372158c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
}

var TLBs = tvm.MustNewTLBMap([]any{
	TopUpTons{},
})
