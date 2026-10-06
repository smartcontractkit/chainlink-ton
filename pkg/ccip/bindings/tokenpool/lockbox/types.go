package lockbox

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
)

// --- Constants ---

// OperatorRole is the RBAC role required to operate the lockbox.
//
// It MUST match the Tolk contract constant in
// contracts/contracts/ccip/pools/lockbox/types.tolk (`"OPERATOR_ROLE".crc32()`).
// Keep in sync with the jest helper
// contracts/tests/ccip/helpers/lockbox.ts (OPERATOR_ROLE_VALUE).
const OperatorRole = 2725715204 // crc32("OPERATOR_ROLE")

// Deposits the token into the lockbox.
type Deposit struct {
	_                   tlb.Magic        `tlb:"#9e9ec361" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`    // The address of the token to deposit.
	RemoteChainSelector uint64           `tlb:"## 64"`   // Destination chain selector for cross-chain routing.
	Amount              tlb.Coins        `tlb:"."`       // The amount of tokens to deposit.
	Context             *cell.Cell       `tlb:"maybe ^"` // Optional context carried through the deposit flow.
}

// WithdrawExtra holds optional extra fields for Withdraw.
type WithdrawExtra struct {
	SendExcessesTo   *address.Address `tlb:"addr"`
	FailureContext   *cell.Cell       `tlb:"maybe ^"` // Optional context carried through withdrawal failure chain.
	ForwardTonAmount tlb.Coins        `tlb:"."`       // Additional TON forwarded to the recipient wallet after the transfer.
	ForwardPayload   *cell.Cell       `tlb:"maybe ^"` // Pool context forwarded to the recipient wallet (e.g., release context for notification back to the pool).
}

// Withdraws tokens to a specific recipient.
type Withdraw struct {
	_                   tlb.Magic        `tlb:"#d065c306" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`  // The address of the token to withdraw.
	RemoteChainSelector uint64           `tlb:"## 64"` // Destination chain selector for cross-chain routing.
	Amount              tlb.Coins        `tlb:"."`     // The amount of tokens to withdraw. If set to max uint256, withdraws the entire balance.
	RecipientWallet     *address.Address `tlb:"addr"`  // The jetton wallet address of the recipient.
	Extra               *WithdrawExtra   `tlb:"maybe ^"`
}

// Deposited is sent back to the transfer initiator after a deposit is confirmed.
type Deposited struct {
	_         tlb.Magic        `tlb:"#6d077f2e" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID   uint64           `tlb:"## 64"`
	Token     *address.Address `tlb:"addr"`    // The token address.
	Depositor *address.Address `tlb:"addr"`    // The address of the account that initiated the deposit.
	Amount    tlb.Coins        `tlb:"."`       // The amount of tokens deposited.
	Context   *cell.Cell       `tlb:"maybe ^"` // Optional context carried through the deposit flow.
}

// DepositFailed reports logical rejection; ReturnAttempted does not confirm custody delivery.
type DepositFailed struct {
	_               tlb.Magic        `tlb:"#5e28ebd8" json:"-"` //nolint:revive
	QueryID         uint64           `tlb:"## 64"`
	Token           *address.Address `tlb:"addr"`
	Depositor       *address.Address `tlb:"addr"`
	Amount          tlb.Coins        `tlb:"."`
	Context         *cell.Cell       `tlb:"maybe ^"`
	ErrorCode       uint16           `tlb:"## 16"`
	ReturnAttempted bool             `tlb:"bool"`
}

// Init initializes the lockbox with a jetton minter/wallet and admin.
// This is the deployment-time initialization message.
type Init struct {
	_             tlb.Magic        `tlb:"#ffa6eeb9" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID       uint64           `tlb:"## 64"`
	MinterAddress *address.Address `tlb:"addr"` // The jetton minter address.
	WalletAddress *address.Address `tlb:"addr"` // The jetton wallet address of the lockbox.
	Admin         *address.Address `tlb:"addr"` // Optional admin address (falls back to sender).
}

// Initialized is sent as a reply after successful initialization.
type Initialized struct {
	_             tlb.Magic        `tlb:"#e9f4e311" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID       uint64           `tlb:"## 64"`
	MinterAddress *address.Address `tlb:"addr"` // The jetton minter address.
	WalletAddress *address.Address `tlb:"addr"` // The jetton wallet address.
	Admin         *address.Address `tlb:"addr"` // The admin address.
}

// WithdrawFailed is sent when a withdrawal bounce is detected.
type WithdrawFailed struct {
	_               tlb.Magic        `tlb:"#60bae556" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID         uint64           `tlb:"## 64"`
	Token           *address.Address `tlb:"addr"`    // The token address.
	Amount          tlb.Coins        `tlb:"."`       // The amount that failed to withdraw.
	RecipientWallet *address.Address `tlb:"addr"`    // The jetton wallet address of the intended recipient.
	Context         *cell.Cell       `tlb:"maybe ^"` // Optional context carried through the failure chain.
}

// ExitCode represents a JettonLockBox-specific error code.
// FACILITY_ID = 567, base error = 56700.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.50.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	TokenAmountCannotBeZero ExitCode = iota + 56700 // Facility ID 567 * 100
	RecipientCannotBeZeroAddress
	UnsupportedToken
	ContractAlreadyInitialized
	ContractNotInitialized
	MissingOrMalformedForwardPayload
	UnauthorizedInitializer
)

// New converts an ExitCode to a tvm.ExitCode.
func (e ExitCode) New() tvm.ExitCode {
	return tvm.ExitCode(e)
}

// --- Storage ---

// Storage represents the JettonLockBox contract storage.
type Storage struct {
	ID uint64 `tlb:"## 64"`
	// Initializer is the address bound at deployment that is allowed to initialize the
	// lockbox. Nil when unbound (legacy/tests), in which case the first caller binds itself.
	Initializer   *address.Address `tlb:"addr"`
	MinterAddress *address.Address `tlb:"addr"`
	WalletAddress *address.Address `tlb:"addr"`
	RBAC          rbac.Data        `tlb:"."`
}

// IsInitialized returns true if the lockbox has been initialized (walletAddress is set).
func (s *Storage) IsInitialized() bool {
	return s.WalletAddress != nil
}

// --- TLB Registry ---

var TLBs = tvm.MustNewTLBMap([]any{
	// Incoming
	Deposit{},
	Withdraw{},
	Init{},
	// Outgoing
	Deposited{},
	DepositFailed{},
	Initialized{},
	WithdrawFailed{},
}).MustWithStorageType(Storage{})
