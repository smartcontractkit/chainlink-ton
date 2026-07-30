import "../../lib/deployable/namespace"

struct TokenRegistry_TokenInfo {
    tokenPool: address
    minterAddress: address
    enabled: bool
}

/// Derives the token registry contract address from the token address
fun TokenRegistry_DeriveAddress(code: cell, tokenAddress: address): AutoDeployAddress {
    return {
        stateInit: {
            code,
            data: NamespacedDeployableData({
                namespace: DeployableNamespace_TokenRegistry,
                owner: contract.getAddress(),
                id: tokenAddress,
            }),
        }
    }
}
