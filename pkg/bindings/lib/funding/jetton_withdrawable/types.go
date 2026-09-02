package jetton_withdrawable

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
)

// --- Constants ---

const (
	// MinReserve is the pool's own gas/storage reserve that the inbound withdrawal
	// value must cover on top of the sum of the relayed transfer values (0.01 TON).
	MinReserve = uint64(10_000_000) // 0.01 TON in nanotons

	// WithdrawOpcode is the opcode of the incoming Withdraw message (0x0d00995c).
	WithdrawOpcode = 0x0d00995c

	// WithdrawContextOpcode is the opcode (crc32("JettonWithdrawableWithdraw"))
	// placed in a relayed AskToTransfer.customPayload to tag it as a fee withdrawal
	// so its bounce can be recognized and reported back to the initiator.
	WithdrawContextOpcode = 0x943e281e

	// TopicFeeTokenWithdrawn is the CRC32 topic of the FeeTokenWithdrawn event.
	TopicFeeTokenWithdrawn = "FeeTokenWithdrawn"
)

// --- Data types (withdraw-request payload) ---

// WithdrawFeeTransfer is one concrete fee-withdrawal step: the wallet to relay an
// AskToTransfer to, the TON value forwarded with it (paying the wallet's compute +
// forward), and the transfer itself.
type WithdrawFeeTransfer struct {
	Wallet *address.Address     `tlb:"addr"`
	Value  tlb.Coins            `tlb:"."`
	Msg    wallet.AskToTransfer `tlb:"."`
}

// --- Messages (incoming) ---

// Withdraw requests withdrawal of accrued fee jettons.
type Withdraw struct {
	_         tlb.Magic                       `tlb:"#0d00995c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID   uint64                          `tlb:"## 64"`
	Transfers tlbe.Array[WithdrawFeeTransfer] `tlb:"."`
}

// --- Bounce/context types ---

// WithdrawContext is correlated with each relayed fee-withdrawal AskToTransfer so a
// bounce knows it is a fee withdrawal and who requested it.
type WithdrawContext struct {
	Opcode            uint32           `tlb:"## 32"`
	WithdrawInitiator *address.Address `tlb:"addr"`
}

// --- Messages (outgoing) ---

// WithdrawFailed notifies the withdrawal initiator when their fee-withdraw
// AskToTransfer bounced.
type WithdrawFailed struct {
	Wallet *address.Address     `tlb:"addr"`
	Ask    wallet.AskToTransfer `tlb:"."`
}

// --- Events ---

// FeeTokenWithdrawn is emitted for observability when jettons are withdrawn.
type FeeTokenWithdrawn struct {
	Wallet *address.Address `tlb:"addr"`
	Amount tlb.Coins        `tlb:"."`
}

var TLBs = tvm.MustNewTLBMap([]any{
	Withdraw{},
})
