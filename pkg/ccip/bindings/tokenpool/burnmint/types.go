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
	// ContextExecutorDeployValue is the TON value for deploying a ContextExecutor.
	ContextExecutorDeployValue = 20000000 // 0.02 TON in nanotons
)

// --- Data types ---

// BurnContext represents the context for a burn operation managed by ContextExecutor.
// Corresponds to BurnMintTokenPool_BurnContext in the Tolk contract (opcode: 0xba302a47).
type BurnContext struct {
	_              tlb.Magic                          `tlb:"#ba302a47" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	Wallet         *address.Address                   `tlb:"addr"`
	ForwardPayload tokenpool.LockOrBurnForwardPayload `tlb:"^"`
}

// MintContext represents the context for a mint operation managed by ContextExecutor.
// Corresponds to BurnMintTokenPool_MintContext in the Tolk contract (opcode: 0xb3d52361).
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
// Matches Tolk: struct Storage { poolData: Cell<TokenPool_Data>; contextExecutorCode: cell; contextExecutorNextId: uint64; }
type Storage struct {
	PoolData              tokenpool.Storage `tlb:"^"`
	ContextExecutorCode   *cell.Cell        `tlb:"^"`     // Code cell for ContextExecutor deployment
	ContextExecutorNextID uint64            `tlb:"## 64"` // Monotonically increasing ID for deterministic executor addresses
}

// --- Exit Codes ---

// ExitCode represents a BurnMintTokenPool-specific error code.
// FACILITY_ID = 412, base error = 41200.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	ExitCodeUnexpectedBurnBounce ExitCode = iota + 41200 // Facility ID 412 * 100
	ExitCodeUnexpectedMintBounce
	ExitCodeContextExecutorUnavailable
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
