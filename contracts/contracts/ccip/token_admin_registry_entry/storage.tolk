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
    /// Set once the token answers a TEP-89 query with a wallet.
    tokenVerified: bool = false
    /// Pool that has not answered the transfer initiator probe yet.
    pendingPool: address? = null
}

/// The token is reported with its pool only once the token answered the TEP-89 query and no pool
/// update awaits the probe answer.
fun TokenRegistry_Storage.isEnabled(self): bool {
    return self.tokenVerified && self.pendingPool == null;
}

fun TokenRegistry_Storage.load(): TokenRegistry_Storage {
    return TokenRegistry_Storage.fromCell(contract.getData());
}

fun TokenRegistry_Storage.store(self) {
    contract.setData(TokenRegistry_Storage{
        tokenAddress: self.tokenAddress,
        tokenInfo: self.tokenInfo,
        adminConfig: self.adminConfig,
        tokenVerified: self.tokenVerified,
        pendingPool: self.pendingPool,
    }.toCell());
}
