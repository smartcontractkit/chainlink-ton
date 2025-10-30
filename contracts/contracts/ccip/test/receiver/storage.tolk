import "../../../lib/access/ownable_2step"

struct Storage {
    id: uint32;
    ownable: Ownable2Step;
    authorizedCaller: address; // When using the contract in CCIP, the authorized caller must be the router
    behaviour: ReceiverBehavior;
}

enum ReceiverBehavior : uint8 {
    AlwaysSuccess = 0,
    AlwaysFailGracefully,
    ConsumerAllGas
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
