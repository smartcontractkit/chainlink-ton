import "../../common/types"
import "../../pools/lib/token_pool/messages"

// TODO: replace with real lockorburn message
struct (0x7dd8f942) MockTokenPool_LockOrBurn {
	tokenAmount: TokenAmount,
	notify: address,
}

// Persisted mock state: the remote (destination) token address most recently configured
// via TokenPool_ApplyChainUpdates. It is returned as `destTokenAddress` on lockOrBurn,
// mirroring how the productive TokenPool sources it from its remote-chain config.
struct MockTokenPool_Storage {
	destTokenAddress: Cell<CrossChainAddress>;
}

// The mock accepts its own lock/burn trigger plus the real pool's TokenPool_ApplyChainUpdates
// (opcode 0x56f73d37) so the deployment adapter can configure the remote token address using
// exactly the same message it will send to the productive TokenPool.
type MockTokenPool_InMessage =
	| MockTokenPool_LockOrBurn
	| TokenPool_ApplyChainUpdates;
