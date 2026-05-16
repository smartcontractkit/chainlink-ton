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
	PkgLib  tvm.FullyQualifiedName = "link.chain.ton.lib"
	PkgCCIP tvm.FullyQualifiedName = "link.chain.ton.ccip"
	PkgMCMS tvm.FullyQualifiedName = "link.chain.ton.mcms"

	// Third-party contract types
	PkgJetton tvm.FullyQualifiedName = "com.github.ton-blockchain.jetton-contract"

	// TODO: move these constants to their respective packages
	// Contract types

	// Libs and traits
	TypeOwnable      tvm.FullyQualifiedName = PkgLib + ".access.Ownable"
	TypeRBAC         tvm.FullyQualifiedName = PkgLib + ".access.RBAC"
	TypeWithdrawable tvm.FullyQualifiedName = PkgLib + ".funding.Withdrawable"
	TypeUpgradeable  tvm.FullyQualifiedName = PkgLib + ".versioning.Upgradeable"

	// MCMS
	TypeMCMS     tvm.FullyQualifiedName = PkgMCMS + ".MCMS"
	TypeTimelock tvm.FullyQualifiedName = PkgMCMS + ".Timelock"

	// CCIP
	TypeRouter          tvm.FullyQualifiedName = PkgCCIP + ".Router"
	TypeOnRamp          tvm.FullyQualifiedName = PkgCCIP + ".OnRamp"
	TypeOffRamp         tvm.FullyQualifiedName = PkgCCIP + ".OffRamp"
	TypeFeeQuoter       tvm.FullyQualifiedName = PkgCCIP + ".FeeQuoter"
	TypeSendExecutor    tvm.FullyQualifiedName = PkgCCIP + ".CCIPSendExecutor"
	TypeDeployable      tvm.FullyQualifiedName = PkgCCIP + ".Deployable"
	TypeMerkleRoot      tvm.FullyQualifiedName = PkgCCIP + ".MerkleRoot"
	TypeReceiveExecutor tvm.FullyQualifiedName = PkgCCIP + ".ReceiveExecutor"
	TypeTestReceiver    tvm.FullyQualifiedName = PkgCCIP + ".test.Receiver"

	// Jetton
	TypeJettonWallet tvm.FullyQualifiedName = PkgJetton + ".contracts.jetton-wallet"
	TypeJettonMinter tvm.FullyQualifiedName = PkgJetton + ".contracts.jetton-minter"
)

// ShortName constants are the CLD-compatible short contract type names.
// These are used in types.Transaction.ContractType and the CLD datastore.
// They must match the ds.ContractType values defined in deployment/state/.
const (
	ShortRouter          = "Router"
	ShortFeeQuoter       = "FeeQuoter"
	ShortOnRamp          = "OnRamp"
	ShortOffRamp         = "OffRamp"
	ShortSendExecutor    = "SendExecutor"
	ShortDeployer        = "Deployer"
	ShortMerkleRoot      = "MerkleRoot"
	ShortReceiveExecutor = "ReceiveExecutor"
	ShortReceiver        = "Receiver"
	ShortTimelock        = "RBACTimelock"
	ShortMCMS            = "MCMS"

	// Trait short names (used as ContractType when encoding trait-level messages)
	ShortOwnable      = "Ownable"
	ShortRBAC         = "RBAC" // ShortType for Role-Based Access Control trait
	ShortWithdrawable = "Withdrawable"
	ShortUpgradeable  = "Upgradeable"

	// Jetton short names
	ShortJettonWallet = "JettonWallet"
	ShortJettonMinter = "JettonMinter"
)

// AllContractTypes lists every fully qualified name for contracts present in the bindings
var AllContractTypes = []struct {
	SimpleName   string
	ContractType tvm.FullyQualifiedName
}{
	{ShortRouter, TypeRouter},
	{ShortFeeQuoter, TypeFeeQuoter},
	{ShortOnRamp, TypeOnRamp},
	{ShortOffRamp, TypeOffRamp},
	{ShortSendExecutor, TypeSendExecutor},
	{ShortDeployer, TypeDeployable},
	{ShortMerkleRoot, TypeMerkleRoot},
	{ShortReceiveExecutor, TypeReceiveExecutor},
	{ShortReceiver, TypeTestReceiver},
	{ShortTimelock, TypeTimelock},
	{ShortMCMS, TypeMCMS},
}

// ShortToFQT maps CLD short contract type names to their fully qualified types.
var ShortToFQT = func() map[string]tvm.FullyQualifiedName {
	m := map[string]tvm.FullyQualifiedName{
		// Traits (not in AllContractTypes)
		ShortOwnable:      TypeOwnable,
		ShortRBAC:         TypeRBAC,
		ShortWithdrawable: TypeWithdrawable,
		ShortUpgradeable:  TypeUpgradeable,
		// Jetton
		ShortJettonWallet: TypeJettonWallet,
		ShortJettonMinter: TypeJettonMinter,
	}
	for _, ct := range AllContractTypes {
		m[ct.SimpleName] = ct.ContractType
	}
	return m
}()

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
