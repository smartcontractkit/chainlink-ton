import "../../lib/deployable/namespace"

// A TokenAdminRegistryEntry is the deterministic, per-token shard managed by
// TokenAdminRegistry.  The TokenRegistry_* ABI names are intentionally kept
// during the migration so existing send/receive executors remain compatible.
struct TokenRegistry_TokenInfo {
    tokenPool: address
    minterAddress: address
    enabled: bool
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
