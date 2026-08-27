import "types"

struct TokenRegistry_AdminConfig {
    tokenAdminRegistry: address
    administrator: address?
    pendingAdministrator: address?
}

struct TokenRegistry_Storage {
    tokenAddress: address
    tokenInfo: TokenRegistry_TokenInfo
    adminConfig: Cell<TokenRegistry_AdminConfig>
}

fun TokenRegistry_Storage.load(): TokenRegistry_Storage {
    return TokenRegistry_Storage.fromCell(contract.getData());
}

fun TokenRegistry_Storage.store(self) {
    contract.setData(TokenRegistry_Storage{
        tokenAddress: self.tokenAddress,
        tokenInfo: self.tokenInfo,
        adminConfig: self.adminConfig,
    }.toCell());
}
