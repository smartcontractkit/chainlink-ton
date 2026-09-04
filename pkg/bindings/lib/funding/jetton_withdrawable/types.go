package jetton_withdrawable

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
)

// --- Constants ---

const (
	// MinReserve is the rent cushion reserved on top of the pool's full pre-existing
	// balance (plus its storage due payment) the inbound withdrawal value must cover
	MinReserve = uint64(10_000_000) // 0.01 TON in nanotons

	// WithdrawOpcode is the opcode of the incoming Withdraw message (0x0d00995c).
	WithdrawOpcode = 0x0d00995c

	// Opcode (crc32("JettonWithdrawableWithdraw")) of the WithdrawContext stored
	// in the ForwardPayloadWrap
	WithdrawContextOpcode = 0x943e281e

	// Opcode (crc32("Jetton_ForwardPayloadWrap")) of the generic Jetton_ForwardPayloadWrap
	// cell carried in a relayed AskToTransfer.forwardPayload.
	ForwardPayloadWrapOpcode = 0x2d61600c

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

// ForwardPayloadWrap is the generic processor-context wrapper carried in an AskToTransfer.forwardPayload.
// TEP-74 forwards forwardPayload to the destination as-is, so a processor can tag an outbound ask with
// bounce-handling context while preserving the caller's original payload.
type ForwardPayloadWrap struct {
	_              tlb.Magic        `tlb:"#2d61600c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	Initiator      *address.Address `tlb:"addr"`
	Context        *cell.Cell       `tlb:"maybe ^"`
	ForwardPayload *cell.Cell       `tlb:"either. ^"`
}

// WithdrawContext is correlated with each relayed fee-withdrawal AskToTransfer so a
// bounce knows it is a fee withdrawal and who requested it. It is stored in the Context
// cell of a ForwardPayloadWrap in the ask's forwardPayload.
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
