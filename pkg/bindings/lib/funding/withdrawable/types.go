package withdrawable

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// Withdraw TON from the contract balance.
type Withdraw struct {
	_ tlb.Magic `tlb:"#f343fc1b" json:"-"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	Destination       *address.Address `tlb:"addr"` // Role definition.
	Amount            *tlb.Coins       `tlb:"."`    // Amount to withdraw. Ignored if drain is true.
	Reserve           *tlb.Coins       `tlb:"."`    // Overwrite reserve.
	DrainAllAvailable bool             `tlb:"bool"` // Ignore amount. If force is true, withdraw all balance, otherwise withdraw all balance above reserve.
}

var TLBs = tvm.MustNewTLBMap([]any{
	Withdraw{},
})

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(InsufficientBalance)
		ecMax = int32(InvalidRequest)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	InsufficientBalance ExitCode = iota + 44800
	HitReserve
	InvalidRequest
)
