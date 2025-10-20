import "../../lib/access/ownable_2step"

struct Storage {
    id: uint32;
    ownable: Ownable2Step;

    // TODO: expand this with versions support
    onRamps: map<uint64, address>; // destChainSelector -> onRamp address
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}


