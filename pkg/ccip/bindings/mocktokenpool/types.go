// Package mocktokenpool holds the Go bindings for the CCIP test MockTokenPool
// contract (contracts/contracts/ccip/test/tokenPool). The mock stands in for the
// productive TokenPool on the source-chain send path until the real pool is
// integrated.
package mocktokenpool

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
)

// Storage is the MockTokenPool contract storage: a single ref cell wrapping the
// productive TokenPool_Data layout, exactly like the real TokenPool implementations
// (BurnMintTokenPool, LockReleaseTokenPool, ...) do via `poolData: Cell<TokenPool_Data>`.
//
// Corresponds to Storage in contracts/contracts/ccip/test/tokenPool/contract.tolk.
type Storage struct {
	PoolData tokenpool.Storage `tlb:"^"`
}

// ApplyChainUpdates is the message the deployment adapter sends to configure the
// remote chain configs on the mock. The mock deliberately handles the real
// TokenPool_ApplyChainUpdates message (opcode 0x56f73d37) so the adapter builds and
// sends it exactly as it will for the productive TokenPool; hence this is a type
// alias rather than a bespoke mock message.
type ApplyChainUpdates = tokenpool.ApplyChainUpdates

// ChainUpdate is re-exported for convenience when constructing ApplyChainUpdates.
type ChainUpdate = tokenpool.ChainUpdate
