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

// TODO we should use a type alias for these, sometihng like ContractTypeLong
const (
	PkgLib  = "link.chain.ton.lib"
	PkgCCIP = "link.chain.ton.ccip"
	PkgMCMS = "link.chain.ton.mcms"

	// Third-party contract types
	PkgJetton = "com.github.ton-blockchain.jetton-contract"

	// TODO: move these constants to their respective packages
	// Contract types

	// Libs and traits
	TypeOwnable      = PkgLib + ".access.Ownable"
	TypeRBAC         = PkgLib + ".access.RBAC"
	TypeWithdrawable = PkgLib + ".funding.Withdrawable"
	TypeUpgradeable  = PkgLib + ".versioning.Upgradeable"

	// MCMS
	TypeMCMS     = PkgMCMS + ".MCMS"
	TypeTimelock = PkgMCMS + ".Timelock"

	// CCIP
	TypeRouter          = PkgCCIP + ".Router"
	TypeOnRamp          = PkgCCIP + ".OnRamp"
	TypeOffRamp         = PkgCCIP + ".OffRamp"
	TypeFeeQuoter       = PkgCCIP + ".FeeQuoter"
	TypeSendExecutor    = PkgCCIP + ".CCIPSendExecutor"
	TypeDeployable      = PkgCCIP + ".Deployable"
	TypeMerkleRoot      = PkgCCIP + ".MerkleRoot"
	TypeReceiveExecutor = PkgCCIP + ".ReceiveExecutor"
	TypeTestReceiver    = PkgCCIP + ".test.Receiver"

	// Jetton
	TypeJettonWallet = PkgJetton + ".contracts.jetton-wallet"
	TypeJettonMinter = PkgJetton + ".contracts.jetton-minter"
)

// AllContractTypes lists every fully qualified name for contracts present in the bindings
var AllContractTypes = []struct {
	SimpleName   string
	ContractType string
}{
	{"Router", TypeRouter},
	{"FeeQuoter", TypeFeeQuoter},
	{"OnRamp", TypeOnRamp},
	{"OffRamp", TypeOffRamp},
	{"SendExecutor", TypeSendExecutor},
	{"Deployable", TypeDeployable},
	{"MerkleRoot", TypeMerkleRoot},
	{"ReceiveExecutor", TypeReceiveExecutor},
	{"TestReceiver", TypeTestReceiver},
	{"Timelock", TypeTimelock},
	{"MCMS", TypeMCMS},
}

// Map of TLBs keyed by contract type
var Registry = tvm.ContractTLBRegistry{
	// Libs and traits
	TypeOwnable:      ownable2step.TLBs,
	TypeRBAC:         rbac.TLBs,
	TypeWithdrawable: withdrawable.TLBs,
	TypeUpgradeable:  upgradeable.TLBs,

	// MCMS contract types
	TypeMCMS:     mcms.TLBs,
	TypeTimelock: timelock.TLBs,

	// CCIP contract types
	TypeRouter:       router.TLBs,
	TypeOnRamp:       onramp.TLBs,
	TypeOffRamp:      offramp.TLBs,
	TypeFeeQuoter:    feequoter.TLBs,
	TypeSendExecutor: ccipsendexecutor.TLBs,

	// Jetton contract types
	TypeJettonWallet: wallet.TLBs,
	TypeJettonMinter: minter.TLBs,
}
