package deposit

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
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
	Proxy         *address.Address                         `tlb:"addr"`
	Beneficiaries *tlbe.Dict[common.AddressWrap, struct{}] `tlb:"."`
}

// --- Messages (incoming) ---

// Init activates the account. Only the owner may send it.
type Init struct {
	_              tlb.Magic  `tlb:"#6890a205" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64     `tlb:"## 64"`
	ForwardPayload *cell.Cell `tlb:"maybe ^"`
}

// Withdraw lets a beneficiary transfer jettons from this account's wallet.
type Withdraw struct {
	_             tlb.Magic        `tlb:"#1936d112" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID       uint64           `tlb:"## 64"`
	WalletAddress *address.Address `tlb:"addr"`
	Ask           *cell.Cell       `tlb:"^"` // Cell<AskToTransfer>
}

// --- Messages (outgoing) ---

// Reply is sent to the initiator on successful initialization.
type Reply struct {
	_              tlb.Magic  `tlb:"#da04630c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64     `tlb:"## 64"`
	ForwardPayload *cell.Cell `tlb:"maybe ^"`
}

// InMessageForward holds the metadata of an original incoming message forwarded
type InMessageForward struct {
	SenderAddress      *address.Address `tlb:"addr"`
	ValueCoins         tlb.Coins        `tlb:"."`
	ValueExtra         *cell.Dictionary `tlb:"dict 256"` // ExtraCurrenciesMap (map<uint256, Coins>)
	OriginalForwardFee tlb.Coins        `tlb:"."`
	CreatedLT          uint64           `tlb:"## 64"`
	CreatedAt          uint32           `tlb:"## 32"`
	Body               *cell.Cell       `tlb:"^"`
}

// ForwardNotification is sent to the proxy when a message is forwarded.
type ForwardNotification struct {
	_       tlb.Magic  `tlb:"#b4fe5c0c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	Message *cell.Cell `tlb:"^"`                  // Cell<InMessageForward>
}

// WithdrawFailed notifies the withdraw requester that the AskToTransfer bounced.
type WithdrawFailed struct {
	_             tlb.Magic        `tlb:"#a51b6cba" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID       uint64           `tlb:"## 64"`
	WalletAddress *address.Address `tlb:"addr"`
	Ask           *cell.Cell       `tlb:"^"` // Cell<AskToTransfer>
}

// AskToTransfer is the standard jetton transfer request used to withdraw jettons.
type AskToTransfer = wallet.AskToTransfer

var TLBs = tvm.MustNewTLBMap([]any{
	Init{},
	Withdraw{},
	Reply{},
	ForwardNotification{},
	WithdrawFailed{},
}).MustWithStorageType(Data{})
