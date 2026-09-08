import "../../lib/deployable/namespace"

// A TokenAdminRegistryEntry is the deterministic, per-token shard managed by
// TokenAdminRegistry.
struct TokenRegistry_TokenInfo {
    tokenPool: address
    minterAddress: address
    enabled: bool
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
