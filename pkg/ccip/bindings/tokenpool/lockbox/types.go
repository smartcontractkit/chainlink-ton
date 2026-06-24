package lockbox

import (
	"math/big"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

// Deposits the token into the lockbox.
type Deposit struct {
	_                   tlb.Magic        `tlb:"#d53276db" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`   // The address of the token to deposit.
	RemoteChainSelector uint64           `tlb:"## 64"`  // The chain selector of the remote chain.
	Amount              *big.Int         `tlb:"## 256"` // The amount of tokens to deposit.
}

// Withdraws tokens to a specific recipient.
type Withdraw struct {
	_                   tlb.Magic        `tlb:"#d53276db" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`   // The address of the token to withdraw.
	RemoteChainSelector uint64           `tlb:"## 64"`  // The chain selector of the remote chain.
	Amount              *big.Int         `tlb:"## 256"` // The amount of tokens to withdraw. If set to max uint256, withdraws the entire balance.
	Recipient           *address.Address `tlb:"addr"`   // The address of the recipient to receive the withdrawn tokens.
}

// --- Exit Codes ---

// ExitCode represents a LockReleaseTokenPool-specific error code.
// FACILITY_ID = 263, base error = 26300.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	// TODO: update error code
	InsufficientBalance ExitCode = iota + 26300 // Facility ID 263 * 100
	TokenAmountCannotBeZero
	RecipientCannotBeZeroAddress
	UnsupportedToken
)

// New converts an ExitCode to a tvm.ExitCode.
func (e ExitCode) New() tvm.ExitCode {
	return tvm.ExitCode(e)
}

// --- TLB Registry ---

var TLBs = tvm.MustNewTLBMap([]any{
	// Incoming
	Deposit{},
	Withdraw{},
})
