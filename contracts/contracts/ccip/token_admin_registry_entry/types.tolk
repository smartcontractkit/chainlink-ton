import "../../lib/deployable/namespace"

// A TokenAdminRegistryEntry is the deterministic, per-token shard managed by
// TokenAdminRegistry.
struct TokenRegistry_TokenInfo {
    /// A null pool delists the token from CCIP.
    tokenPool: address?
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

/// Version of the entry code. Bump it whenever the entry code or its storage
/// layout changes. Requesters declare the minimum version they can consume and
/// a stale entry upgrades itself through the root before serving them.
const TokenAdminRegistryEntry_VERSION = 1;

/// A request kept in flight while its entry is upgraded. It is never persisted.
struct TokenAdminRegistryEntry_Pending {
    /// Original sender of the pending request.
    sender: address
    body: cell
}
