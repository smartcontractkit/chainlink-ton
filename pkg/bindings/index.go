package bindings

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/minter"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/funding/withdrawable"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/versioning/upgradeable"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ccipsendexecutor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
)

const (
	// TODO: rename as "link.chain.ton.<...>"?
	PkgLib  = "com.chainlink.ton.lib"
	PkgCCIP = "com.chainlink.ton.ccip"
	PkgMCMS = "com.chainlink.ton.mcms"

	// Third-party contract types
	PkgJetton = "com.github.ton-blockchain.jetton-contract"
)

// Map of TLBs keyed by contract type
var Registry = tvm.ContractTLBRegistry{
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
	PkgMCMS + ".MCMS":     mcms.TLBs,
	PkgMCMS + ".Timelock": timelock.TLBs,

	// Libs and traits
	PkgLib + ".access.Ownable":         ownable2step.TLBs,
	PkgLib + ".access.RBAC":            rbac.TLBs,
	PkgLib + ".funding.Withdrawable":   withdrawable.TLBs,
	PkgLib + ".versioning.Upgradeable": upgradeable.TLBs,
}
