package burnmint

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// --- Constants ---

// --- Data types ---

// PendingBurn represents a pending burn operation.
// Corresponds to BurnMintTokenPool_PendingBurn in the Tolk contract.
type PendingBurn struct {
	ForwardPayload tokenpool.LockOrBurnForwardPayload `tlb:"."`
	ExpectedSender *address.Address                   `tlb:"addr"`
}

// PendingMint represents a pending mint operation.
// Corresponds to BurnMintTokenPool_PendingMint in the Tolk contract.
type PendingMint struct {
	ReplyTo        *address.Address             `tlb:"addr"`
	Request        tokenpool.ReleaseOrMintInV1  `tlb:"^"`
	Out            tokenpool.ReleaseOrMintOutV1 `tlb:"^"`
	ExpectedSender *address.Address             `tlb:"addr"`
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
// Extends the common TokenPool storage with burn/mint specific state.
type Storage struct {
	PoolData     tokenpool.Storage              `tlb:"^"`
	JettonClient *cell.Cell                     `tlb:"^"`       // Cell<JettonClient> - TODO: define JettonClient type in common/jetton bindings
	PendingBurns *tlbe.Dict[uint64, *cell.Cell] `tlb:"dict 64"` // map<uint64, Cell<PendingBurn>>
	PendingMints *tlbe.Dict[uint64, *cell.Cell] `tlb:"dict 64"` // map<uint64, Cell<PendingMint>>
}

// --- Exit Codes ---

// ExitCode represents a BurnMintTokenPool-specific error code.
// FACILITY_ID = 412, base error = 41200.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	ExitCodePendingBurnAlreadyExists ExitCode = iota + 41200 // Facility ID 412 * 100
	ExitCodePendingBurnNotFound
	ExitCodePendingMintAlreadyExists
	ExitCodePendingMintNotFound
	ExitCodeUnexpectedBurnConfirmationSender
	ExitCodeUnexpectedMintConfirmationSender
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
