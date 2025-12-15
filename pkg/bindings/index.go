package bindings

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/minter"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ccipsendexecutor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
)

// Map of TLBs keyed by contract type
var TypeToTLBMap = map[string]lib.TLBMap{
	// Jetton contract types
	"com.github.ton-blockchain.jetton-contract.contracts.jetton-wallet": wallet.TLBs,
	"com.github.ton-blockchain.jetton-contract.contracts.jetton-minter": minter.TLBs,
	// CCIP contract types
	"com.chainlink.ton.ccip.Router":           router.TLBs,
	"com.chainlink.ton.ccip.OnRamp":           onramp.TLBs,
	"com.chainlink.ton.ccip.OffRamp":          offramp.TLBs,
	"com.chainlink.ton.ccip.FeeQuoter":        feequoter.TLBs,
	"com.chainlink.ton.ccip.CCIPSendExecutor": ccipsendexecutor.TLBs,
	// MCMS contract types
	"com.chainlink.ton.lib.access.RBAC": rbac.TLBs,
	"com.chainlink.ton.mcms.MCMS":       mcms.TLBs,
	"com.chainlink.ton.mcms.Timelock":   timelock.TLBs,
}
