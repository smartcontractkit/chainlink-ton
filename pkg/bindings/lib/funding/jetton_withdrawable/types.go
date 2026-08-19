// Package jetton_withdrawable mirrors the Tolk trait
// `link.chain.ton.lib.funding.JettonWithdrawable` (lib/funding/jetton_withdrawable.tolk).
//
// The trait is a shared, stateless handler used by TokenPools to sweep accrued fee
// jettons. The caller builds the exact `AskToTransfer`s to relay and the handler
// enforces per-transfer limits/allowlists plus an inbound-value coverage guard.
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
	// value must cover on top of the sum of the relayed transfer values (0.1 TON).
	MinReserve = uint64(100_000_000) // 0.1 TON in nanotons

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
//
//	Matches Tolk: struct JettonWithdrawable_WithdrawFeeTransfer {
//	    wallet: address; value: coins; msg: AskToTransfer }
type WithdrawFeeTransfer struct {
	Wallet *address.Address     `tlb:"addr"`
	Value  tlb.Coins            `tlb:"."`
	Msg    wallet.AskToTransfer `tlb:"."`
}

// --- Messages (incoming) ---

// Withdraw requests withdrawal of accrued fee jettons.
//
//	Matches Tolk: struct (0x0d00995c) JettonWithdrawable_Withdraw {
//	    queryId: uint64; transfers: array<JettonWithdrawable_WithdrawFeeTransfer> }
type Withdraw struct {
	_         tlb.Magic                       `tlb:"#0d00995c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID   uint64                          `tlb:"## 64"`
	Transfers tlbe.Array[WithdrawFeeTransfer] `tlb:"."`
}

// --- Bounce/context types ---

// WithdrawContext is correlated with each relayed fee-withdrawal AskToTransfer so a
// bounce knows it is a fee withdrawal and who requested it.
//
//	Matches Tolk: struct JettonWithdrawable_WithdrawContext {
//	    opcode: uint32; withdrawInitiator: address }
type WithdrawContext struct {
	Opcode            uint32           `tlb:"## 32"`
	WithdrawInitiator *address.Address `tlb:"addr"`
}

// --- Messages (outgoing) ---

// WithdrawFailed notifies the withdrawal initiator when their fee-withdraw
// AskToTransfer bounced.
//
//	Matches Tolk: struct JettonWithdrawable_WithdrawFailed {
//	    wallet: address; ask: AskToTransfer }
type WithdrawFailed struct {
	Wallet *address.Address     `tlb:"addr"`
	Ask    wallet.AskToTransfer `tlb:"."`
}

// --- Events ---

// FeeTokenWithdrawn is emitted for observability when jettons are withdrawn.
//
//	Matches Tolk: struct JettonWithdrawable_FeeTokenWithdrawn {
//	    wallet: address; amount: coins }
type FeeTokenWithdrawn struct {
	Wallet *address.Address `tlb:"addr"`
	Amount tlb.Coins        `tlb:"."`
}

// TLBs registers the magic-bearing message types of this trait. The opcode-keyed TLB map
// requires every entry to carry a leading `tlb.Magic` (see tvm.ExtractMagic), so only
// `Withdraw` is registered here. `WithdrawContext`, `WithdrawFailed` and `FeeTokenWithdrawn`
// are embedded bodies / event payloads (no leading opcode) and are decoded via their container
// or the event topic, not by opcode lookup.
var TLBs = tvm.MustNewTLBMap([]any{
	Withdraw{},
})
