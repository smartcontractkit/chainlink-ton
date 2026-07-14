package lockbox

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
)

// --- Constants ---

// OperatorRole is the RBAC role required to operate the lockbox.
const OperatorRole = 1735955001 // crc32("OPERATOR_ROLE")

// Deposits the token into the lockbox.
type Deposit struct {
	_                   tlb.Magic        `tlb:"#9e9ec361" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`   // The address of the token to deposit.
	RemoteChainSelector uint64           `tlb:"## 64"`  // The chain selector of the remote chain.
	Amount              *big.Int         `tlb:"## 256"` // The amount of tokens to deposit.
}

// WithdrawExtra holds optional extra fields for Withdraw.
type WithdrawExtra struct {
	SendExcessesTo *address.Address `tlb:"addr"`
}

// Withdraws tokens to a specific recipient.
type Withdraw struct {
	_               tlb.Magic        `tlb:"#d065c306" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID         uint64           `tlb:"## 64"`
	Token           *address.Address `tlb:"addr"`   // The address of the token to withdraw.
	Amount          *big.Int         `tlb:"## 256"` // The amount of tokens to withdraw. If set to max uint256, withdraws the entire balance.
	RecipientWallet *address.Address `tlb:"addr"`   // The jetton wallet address of the recipient.
	Extra           *WithdrawExtra   `tlb:"maybe ^"`
}

// Deposited is sent back to the transfer initiator after a deposit is confirmed.
type Deposited struct {
	_                   tlb.Magic        `tlb:"#6d077f2e" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`   // The token address.
	RemoteChainSelector uint64           `tlb:"## 64"`  // The chain selector of the remote chain.
	Amount              *big.Int         `tlb:"## 256"` // The amount of tokens deposited.
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
	Token           *address.Address `tlb:"addr"`   // The token address.
	Amount          *big.Int         `tlb:"## 256"` // The amount that failed to withdraw.
	RecipientWallet *address.Address `tlb:"addr"`   // The jetton wallet address of the intended recipient.
}

// ExitCode represents a JettonLockBox-specific error code.
// FACILITY_ID = 47, base error = 4700.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	TokenAmountCannotBeZero ExitCode = iota + 4700 // Facility ID 47 * 100
	RecipientCannotBeZeroAddress
	UnsupportedToken
	ContractAlreadyInitialized
	ContractNotInitialized
)

// New converts an ExitCode to a tvm.ExitCode.
func (e ExitCode) New() tvm.ExitCode {
	return tvm.ExitCode(e)
}

// --- Storage ---

// Storage represents the JettonLockBox contract storage.
type Storage struct {
	ID            uint64           `tlb:"## 64"`
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
	Initialized{},
	WithdrawFailed{},
}).MustWithStorageType(Storage{})
