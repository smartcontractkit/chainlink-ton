import "../../lib/deployable/namespace"

struct TokenRegistry_TokenInfo {
    tokenPool: address
    minterAddress: address
    enabled: bool
}

struct TokenRegistry {}

/// Derives the token registry contract address from the token address
fun TokenRegistry.deriveAddress(deployableCode: cell, tokenAddress: address, tokenRegistryOwner: address): AutoDeployAddress {
    return {
        stateInit: {
            code: deployableCode,
            data: NamespacedDeployableData({
                namespace: DeployableNamespace_TokenRegistry,
                owner: tokenRegistryOwner,
                id: tokenAddress,
            }),
        }
    }
}
