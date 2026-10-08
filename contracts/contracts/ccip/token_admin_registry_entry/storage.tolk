import "types"

struct TokenRegistry_AdminConfig {
    tokenAdminRegistry: address
    administrator: address?
    pendingAdministrator: address?
}

struct TokenRegistry_Storage {
    tokenAddress: address
    tokenInfo: Cell<TokenRegistry_TokenInfo>
    adminConfig: Cell<TokenRegistry_AdminConfig>
    /// Set once the token answers a TEP-89 query with a wallet. Until then the token is reported
    /// without a pool.
    enabled: bool = false
}

fun TokenRegistry_Storage.load(): TokenRegistry_Storage {
    return TokenRegistry_Storage.fromCell(contract.getData());
}

fun TokenRegistry_Storage.store(self) {
    contract.setData(TokenRegistry_Storage{
        tokenAddress: self.tokenAddress,
        tokenInfo: self.tokenInfo,
        adminConfig: self.adminConfig,
        enabled: self.enabled,
    }.toCell());
}
