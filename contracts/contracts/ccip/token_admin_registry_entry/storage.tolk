import "types"

struct TokenRegistry_Storage {
    tokenAdminRegistry: address
    tokenAddress: address
    tokenInfo: TokenRegistry_TokenInfo
    administrator: address?
    pendingAdministrator: address?
}

fun TokenRegistry_Storage.load(): TokenRegistry_Storage {
    return TokenRegistry_Storage.fromCell(contract.getData());
}

fun TokenRegistry_Storage.store(self) {
    contract.setData(TokenRegistry_Storage{
        tokenAdminRegistry: self.tokenAdminRegistry,
        tokenAddress: self.tokenAddress,
        tokenInfo: self.tokenInfo,
        administrator: self.administrator,
        pendingAdministrator: self.pendingAdministrator,
    }.toCell());
}
