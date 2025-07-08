tolk 1.0

@inline
fun hashOperation(tonValue: int, predecessor: int, salt: int, account: address, msgToSend: cell): int {
    return beginCell()
        .storeCoins(tonValue)
        .storeUint(predecessor, 256)
        .storeUint(salt, 256)
        .storeAddress(account)
        .storeRef(msgToSend)
        .endCell()
        .hash();
}
