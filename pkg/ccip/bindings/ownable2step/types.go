package ownable2step

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// --- Messages - incoming ---

type InMessage interface {
	TransferOwnership |
		AcceptOwnership
}

// Sets a new pending owner. Can only be called by the current owner.
type TransferOwnership struct {
	_ tlb.Magic `tlb:"#f21b7da1" json:"-"` //nolint:revive // Ignore opcode tag

	QueryID  uint64           `tlb:"## 64"`
	NewOwner *address.Address `tlb:"addr"`
}

// AcceptOwnership allows the pending owner to accept ownership of the contract.
type AcceptOwnership struct {
	_ tlb.Magic `tlb:"#f9e29e4a" json:"-"` //nolint:revive // Ignore opcode tag

	QueryID uint64 `tlb:"## 64"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	TransferOwnership{},
	AcceptOwnership{},
})

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorOnlyCallableByOwner)
		ecMax = int32(ErrorMustBeProposedOwner)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorOnlyCallableByOwner ExitCode = iota + 49800 // Facility ID * 100
	ErrorCannotTransferToSelf
	ErrorMustBeProposedOwner
)
