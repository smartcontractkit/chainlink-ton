package bindings

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/minter"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ccipsendexecutor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"

	"github.com/xssnick/tonutils-go/tlb"
)

const (
	// TODO: rename as "link.chain.ton.<...>"?
	PkgLib  = "com.chainlink.ton.lib"
	PkgCCIP = "com.chainlink.ton.ccip"
	PkgMCMS = "com.chainlink.ton.mcms"

	// Test contract types
	PkgTest = "com.chainlink.ton.test"

	// Third-party contract types
	PkgJetton = "com.github.ton-blockchain.jetton-contract"
)

// Map of TLBs keyed by contract type
var Registry = lib.MessageRegistry{
	// Jetton contract types
	PkgJetton + ".contracts.jetton-wallet": wallet.TLBs,
	PkgJetton + ".contracts.jetton-minter": minter.TLBs,
	// CCIP contract types
	PkgCCIP + ".Router":           router.TLBs,
	PkgCCIP + ".OnRamp":           onramp.TLBs,
	PkgCCIP + ".OffRamp":          offramp.TLBs,
	PkgCCIP + ".FeeQuoter":        feequoter.TLBs,
	PkgCCIP + ".CCIPSendExecutor": ccipsendexecutor.TLBs,
	// MCMS contract types
	PkgLib + ".access.RBAC": rbac.TLBs,
	PkgMCMS + ".MCMS":       mcms.TLBs,
	PkgMCMS + ".Timelock":   timelock.TLBs,

	// Test contract types // TODO: (tmp) remove from here, move to test file
	PkgTest + ".Foo": TestTLBs,
}

// Sent back to sender after the executor role check is updated.
type TestMessage struct {
	_ tlb.Magic `tlb:"#c6d451e1" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	Data tlbe.Dict[uint16, common.AddressWrap] `tlb:"^" json:"data"`
}

var TestTLBs = lib.MustNewTLBMap([]any{
	TestMessage{},
})
