import "types"

struct TokenRegistry_Storage {
    info: TokenRegistry_TokenInfo
}

fun TokenRegistry_Storage.load(): TokenRegistry_Storage {
    return TokenRegistry_Storage.fromCell(contract.getData());
}

fun TokenRegistry_Storage.store(self) {
    contract.setData(TokenRegistry_Storage{
        info: self.info,
    }.toCell());
}
