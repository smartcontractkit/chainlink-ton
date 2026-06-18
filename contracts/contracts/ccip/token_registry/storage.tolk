import "types"

struct TokenRegistry_Storage {
    id: uint32
    info: TokenRegistry_TokenInfo
}

fun TokenRegistry_Storage.load(): TokenRegistry_Storage {
    return TokenRegistry_Storage.fromCell(contract.getData());
}

fun TokenRegistry_Storage.store(self) {
    contract.setData(TokenRegistry_Storage{
        id: self.id,
        info: self.info,
    }.toCell());
}
