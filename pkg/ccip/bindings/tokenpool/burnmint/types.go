package burnmint

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
)

// --- Constants ---

const (
	// ClaimAdminValue is the TON value for claiming minter admin.
	ClaimAdminValue = 50000000 // 0.05 TON in nanotons
	// BurnValue is the TON value for burn operations.
	BurnValue = 50000000 // 0.05 TON in nanotons
	// MintValue is the TON value for mint operations.
	MintValue = 100000000 // 0.1 TON in nanotons
)

// --- Data types ---

// BurnContext represents the context carried by the CCT burn path. Stores the pool's own
// jetton wallet address (the burn source) and the full forward payload for finalization.
type BurnContext struct {
	_              tlb.Magic                          `tlb:"#ba302a47" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	Wallet         *address.Address                   `tlb:"addr"`
	ForwardPayload tokenpool.LockOrBurnForwardPayload `tlb:"^"`
}

// MintContext represents the context passed to the DepositAccount (off-ramp role) for mint
// (release) operations. Carries the full forward payload for post-mint finalization.
type MintContext struct {
	_              tlb.Magic                             `tlb:"#b3d52361" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	ForwardPayload tokenpool.ReleaseOrMintForwardPayload `tlb:"^"`
}

// --- Messages (incoming) ---

// ClaimMinterAdmin requests the pool to claim the jetton minter admin role.
type ClaimMinterAdmin struct {
	_       tlb.Magic `tlb:"#39898e4d" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// ReturnExcessesBack is sent by the jetton minter/wallet after a burn or mint operation.
// TODO: move to shared jetton bindings package, shared opcode 0xd53276db
type ReturnExcessesBack struct {
	_       tlb.Magic `tlb:"#d53276db" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// --- Storage ---

// Storage represents the BurnMintTokenPool contract storage.
type Storage struct {
	PoolData           tokenpool.Storage `tlb:"^"`
	OffRampAccountCode *cell.Cell        `tlb:"^"` // Compiled code cell of the DepositAccount (off-ramp role)
}

// --- Exit Codes ---

// ExitCode represents a BurnMintTokenPool-specific error code.
// FACILITY_ID = 94, base error = 9400.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	ExitCodeUnexpectedBurnBounce ExitCode = iota + 9400 // Facility ID 94 * 100
	ExitCodeUnexpectedMintBounce
	ExitCodeInvalidOffRampAccountReply
	ExitCodeInvalidOffRampAccountNotification
	ExitCodeOffRampAccountDeployFailed
)

// New converts an ExitCode to a tvm.ExitCode.
func (e ExitCode) New() tvm.ExitCode {
	return tvm.ExitCode(e)
}

// --- TLB Registry ---

var TLBs = tvm.MustNewTLBMap([]any{
	// Incoming
	ClaimMinterAdmin{},
	ReturnExcessesBack{},
	// Context types
	BurnContext{},
	MintContext{},
}).MustWithStorageType(Storage{})

// --- Standard interface ---

// From imports common types from the parent tokenpool package for convenience.
type (
	LockOrBurn                   = tokenpool.LockOrBurn
	ReleaseOrMint                = tokenpool.ReleaseOrMint
	LockOrBurnTransferDetails    = tokenpool.LockOrBurnTransferDetails
	ReleaseOrMintTransferDetails = tokenpool.ReleaseOrMintTransferDetails
	LockOrBurnForwardPayload     = tokenpool.LockOrBurnForwardPayload
	ChainSelector                = tokenpool.ChainSelector
)
