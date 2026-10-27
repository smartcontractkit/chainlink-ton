package deposit

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// --- Constants ---

// Name and version reported by typeAndVersion() — matches deposit/types.tolk.
const (
	ContractName    = "link.chain.ton.ccip.account.DepositAccount"
	ContractVersion = "0.1.0"
)

// --- Data types (storage) ---

// Data represents the DepositAccount_Data contract storage.
type Data struct {
	Owner         *address.Address                         `tlb:"addr"`
	User          *address.Address                         `tlb:"addr"`
	Token         *address.Address                         `tlb:"addr"`
	Beneficiaries *tlbe.Dict[common.AddressWrap, struct{}] `tlb:"."`
	// Wallet is the account's jetton wallet, learned from Token on the first init.
	Wallet *address.Address `tlb:"maybe ^ addr"`
	// PendingInit is the init waiting for the wallet query; others arriving meanwhile are refused.
	PendingInit *PendingInit `tlb:"maybe ^"`
}

// PendingInit is an init waiting for the account's jetton wallet to be learned.
type PendingInit struct {
	QueryID uint64     `tlb:"## 64"`
	Context *cell.Cell `tlb:"maybe ^"`
}

// --- Messages (incoming) ---

// Init activates the account. Only the owner may send it.
type Init struct {
	_       tlb.Magic  `tlb:"#6890a205" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	Context *cell.Cell `tlb:"maybe ^"`
}

// Withdraw lets a beneficiary transfer jettons out of the account's learned jetton wallet.
type Withdraw struct {
	_       tlb.Magic             `tlb:"#1936d112" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64                `tlb:"## 64"`
	Ask     WithdrawAskToTransfer `tlb:"."`
}

// --- Messages (outgoing) ---

// Initialized is sent to the owner on successful initialization.
type Initialized struct {
	_       tlb.Magic  `tlb:"#784d98e9" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	Context *cell.Cell `tlb:"maybe ^"`
}

// WalletUnavailable replies to an init when the token could not report the account's wallet.
type WalletUnavailable struct {
	_       tlb.Magic  `tlb:"#9293d68e" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	Context *cell.Cell `tlb:"maybe ^"`
}

// ForwardNotification forwards a jetton transfer notification received by the account.
type ForwardNotification struct {
	_            tlb.Magic  `tlb:"#b4fe5c0c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	Notification *cell.Cell `tlb:"^"`                  // Cell<TransferNotificationForRecipient>
}

// Notify is the routing envelope placed as a jetton transfer's forward payload, directly or
// inside a Jetton_ForwardPayloadWrap: the account forwards the notification to Notify.
type Notify struct {
	_      tlb.Magic        `tlb:"#88e0ef3e" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	Notify *address.Address `tlb:"addr"`
}

// WithdrawFailed notifies the withdraw requester that the AskToTransfer bounced.
type WithdrawFailed struct {
	_             tlb.Magic        `tlb:"#a51b6cba" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID       uint64           `tlb:"## 64"`
	User          *address.Address `tlb:"addr"`
	Token         *address.Address `tlb:"addr"`
	WalletAddress *address.Address `tlb:"addr"`
	Request       Withdraw         `tlb:"^"`
}

// WithdrawAskToTransfer has the same fields as the standard jetton transfer request except from
// the QueryID.
//
// @dev Unlike the standard jetton AskToTransfer, whose forwardPayload is a
//
//	ForwardPayloadRemainder, the deposit account declares it as `cell?`
type WithdrawAskToTransfer struct {
	JettonAmount      tlb.Coins        `tlb:"."`
	TransferRecipient *address.Address `tlb:"addr"`
	SendExcessesTo    *address.Address `tlb:"addr"`
	CustomPayload     *cell.Cell       `tlb:"maybe ^"`
	ForwardTonAmount  tlb.Coins        `tlb:"."`
	ForwardPayload    *cell.Cell       `tlb:"maybe ^"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	Init{},
	Withdraw{},
	Initialized{},
	WalletUnavailable{},
	ForwardNotification{},
	WithdrawFailed{},
}).MustWithStorageType(Data{})
