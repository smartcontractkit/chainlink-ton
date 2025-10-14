package jetton

import (
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const (
	OpcodeTopUp = 0xd372158c
)

const (
	ErrorInvalidOp      tvm.ExitCode = tvm.ExitCode(72)
	ErrorWrongOp        tvm.ExitCode = tvm.ExitCode(0xffff)
	ErrorNotOwner       tvm.ExitCode = tvm.ExitCode(73)
	ErrorNotValidWallet tvm.ExitCode = tvm.ExitCode(74)
	ErrorWrongWorkchain tvm.ExitCode = tvm.ExitCode(333)
)

// For funding the contract with TON
type TopUpMessage struct {
	_       tlb.Magic `tlb:"#d372158c"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}
