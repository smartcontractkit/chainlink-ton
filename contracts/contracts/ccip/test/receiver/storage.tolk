struct Storage {
    id: uint32;
    router: address;
    rejectAll: bool;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
