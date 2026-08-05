import "../../lib/deployable/namespace"

struct TokenRegistry_TokenInfo {
    tokenPool: address
    minterAddress: address
    enabled: bool
}

struct TokenRegistry {
    deployableCode: cell
    tokenAddress: address
}

/// Derives the token registry contract address from the token address
fun TokenRegistry.deriveAddress(self): AutoDeployAddress {
    return {
        stateInit: {
            code: self.deployableCode,
            data: NamespacedDeployableData({
                namespace: DeployableNamespace_TokenRegistry,
                owner: contract.getAddress(),
                id: self.tokenAddress,
            }),
        }
    }
}
