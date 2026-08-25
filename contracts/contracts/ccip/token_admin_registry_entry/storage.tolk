import "types"

struct TokenRegistry_Storage {
    tokenAddress: address
    tokenInfo: TokenRegistry_TokenInfo
}

fun TokenRegistry_Storage.load(): TokenRegistry_Storage {
    return TokenRegistry_Storage.fromCell(contract.getData());
}

fun TokenRegistry_Storage.store(self) {
    contract.setData(TokenRegistry_Storage{
        tokenAddress: self.tokenAddress,
        tokenInfo: self.tokenInfo,
    }.toCell());
}
