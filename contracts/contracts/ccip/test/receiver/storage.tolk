struct Storage {
    id: uint32;
    offRamp: address; // TODO: should be router?
    rejectAll: bool;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
