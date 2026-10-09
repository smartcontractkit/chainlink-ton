import "../../lib/deployable/namespace"

// A TokenAdminRegistryEntry is the deterministic, per-token shard managed by
// TokenAdminRegistry.
struct TokenRegistry_TokenInfo {
    /// A null pool delists the token from CCIP.
    tokenPool: address?
    /// `transferInitiator` of the jetton transfers delivering a release/mint (e.g. the pool's
    /// lockbox). Null means the pool itself.
    transferInitiator: address? = null
    minterAddress: address
    /// Pool interface version. It is currently carried but ignored, so a
    /// future pool-interface upgrade can select the correct protocol.
    version: uint32 = 1
}

struct TokenAdminRegistryEntry {}

/// Derives a token-registry entry from the token and its parent registry.
fun TokenAdminRegistryEntry.deriveAddress(deployableCode: cell, tokenAddress: address, tokenAdminRegistry: address): AutoDeployAddress {
    return {
        stateInit: {
            code: deployableCode,
            data: NamespacedDeployableData({
                namespace: DeployableNamespace_TokenRegistry,
                owner: tokenAdminRegistry,
                id: tokenAddress,
            }),
        }
    }
}

/// Attached to the TEP-89 query sent at registration; the token's response returns the unspent part.
/// 10x the measured cost (~0.0008 TON) with the ton-blockchain/jetton-contract reference minter:
/// query and response forward fees, the token's execution and the entry handling the response.
const TokenAdminRegistryEntry_WALLET_QUERY_VALUE: int = grams("0.01");

/// Version of the entry code. Bump it whenever the entry code or its storage
/// layout changes. The root declares it as the minimum in every message to an
/// entry, and a stale entry upgrades itself through the root before handling it.
const TokenAdminRegistryEntry_VERSION = 1;
