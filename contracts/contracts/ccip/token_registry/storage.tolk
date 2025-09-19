tolk 1.0

struct TokenRegistry_Storage {
    onramp: address // TODO this could be MCMS?
    minterAddress: address
    info: TokenRegistry_TokenInfo?
    // mintAuthority: address? TODO add mint authority for when the token is delegated / self served token pools
}

struct TokenRegistry_TokenInfo {
    tokenPool: address
    walletCode: Cell
    enabled: bool
}

struct TokenRegistry_InitializedStorage {
    onramp: address
    minterAddress: address
    info: TokenRegistry_TokenInfo,
}
 
fun TokenRegistry_Storage.load(): TokenRegistry_Storage {
    return TokenRegistry_Storage.fromCell(contract.getData());
}

fun TokenRegistry_Storage.store(self) {
    contract.setData(self.toCell());
}

fun TokenRegistry_InitializedStorage.load(): TokenRegistry_InitializedStorage {
    val st = TokenRegistry_Storage.fromCell(contract.getData());
    assert (st.info != null) throw 5; // TODO propper error
    return TokenRegistry_InitializedStorage {
        onramp: st.onramp,
        minterAddress: st.minterAddress,
        info: st.info,
    };
}

fun TokenRegistry_InitializedStorage.store(self) {
    contract.setData(TokenRegistry_Storage{
        onramp: self.onramp,
        minterAddress: self.minterAddress,
        info: self.info,
    }.toCell());
}