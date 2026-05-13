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
	PkgLib  tvm.FullyQualifiedType = "link.chain.ton.lib"
	PkgCCIP tvm.FullyQualifiedType = "link.chain.ton.ccip"
	PkgMCMS tvm.FullyQualifiedType = "link.chain.ton.mcms"

	// Third-party contract types
	PkgJetton tvm.FullyQualifiedType = "com.github.ton-blockchain.jetton-contract"

	// TODO: move these constants to their respective packages
	// Contract types

	// Libs and traits
	TypeOwnable      tvm.FullyQualifiedType = PkgLib + ".access.Ownable"
	TypeRBAC         tvm.FullyQualifiedType = PkgLib + ".access.RBAC"
	TypeWithdrawable tvm.FullyQualifiedType = PkgLib + ".funding.Withdrawable"
	TypeUpgradeable  tvm.FullyQualifiedType = PkgLib + ".versioning.Upgradeable"

	// MCMS
	TypeMCMS     tvm.FullyQualifiedType = PkgMCMS + ".MCMS"
	TypeTimelock tvm.FullyQualifiedType = PkgMCMS + ".Timelock"

	// CCIP
	TypeRouter          tvm.FullyQualifiedType = PkgCCIP + ".Router"
	TypeOnRamp          tvm.FullyQualifiedType = PkgCCIP + ".OnRamp"
	TypeOffRamp         tvm.FullyQualifiedType = PkgCCIP + ".OffRamp"
	TypeFeeQuoter       tvm.FullyQualifiedType = PkgCCIP + ".FeeQuoter"
	TypeSendExecutor    tvm.FullyQualifiedType = PkgCCIP + ".CCIPSendExecutor"
	TypeDeployable      tvm.FullyQualifiedType = PkgCCIP + ".Deployable"
	TypeMerkleRoot      tvm.FullyQualifiedType = PkgCCIP + ".MerkleRoot"
	TypeReceiveExecutor tvm.FullyQualifiedType = PkgCCIP + ".ReceiveExecutor"
	TypeTestReceiver    tvm.FullyQualifiedType = PkgCCIP + ".test.Receiver"

	// Jetton
	TypeJettonWallet tvm.FullyQualifiedType = PkgJetton + ".contracts.jetton-wallet"
	TypeJettonMinter tvm.FullyQualifiedType = PkgJetton + ".contracts.jetton-minter"
)

// AllContractTypes lists every fully qualified name for contracts present in the bindings
var AllContractTypes = []struct {
	SimpleName   string
	ContractType tvm.FullyQualifiedType
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
