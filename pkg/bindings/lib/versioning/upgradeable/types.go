package upgradeable

import (
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// Message for upgrading a contract.
type Upgrade struct {
	_ tlb.Magic `tlb:"#0aa811ed" json:"-"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	Code *cell.Cell `tlb:"^"` // New contract code.
}

var TLBs = tvm.MustNewTLBMap([]any{
	Upgrade{},
})

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(VersionMismatch)
		ecMax = int32(VersionMismatch)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	VersionMismatch ExitCode = iota + 28700
)
