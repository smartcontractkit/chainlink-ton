// Package mocktokenpool holds the Go bindings for the CCIP test MockTokenPool
// contract (contracts/contracts/ccip/test/tokenPool). The mock stands in for the
// productive TokenPool on the source-chain send path until the real pool is
// integrated.
package mocktokenpool

import (
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
)

// Storage is the MockTokenPool contract storage. It holds the remote (destination)
// token address most recently configured via ApplyChainUpdates, which the mock
// returns as destTokenAddress on lockOrBurn.
//
// Corresponds to MockTokenPool_Storage in the Tolk contract.
type Storage struct {
	DestTokenAddress *tlbe.Cell[common.CrossChainAddress] `tlb:"^"`
}

// ApplyChainUpdates is the message the deployment adapter sends to configure the
// remote token address on the mock. The mock deliberately handles the real
// TokenPool_ApplyChainUpdates message (opcode 0x56f73d37) so the adapter builds and
// sends it exactly as it will for the productive TokenPool; hence this is a type
// alias rather than a bespoke mock message.
type ApplyChainUpdates = tokenpool.ApplyChainUpdates

// ChainUpdate is re-exported for convenience when constructing ApplyChainUpdates.
type ChainUpdate = tokenpool.ChainUpdate
