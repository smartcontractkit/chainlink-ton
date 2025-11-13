struct Deployable<T> {
    owner: address;
    id: T // builder on serialize, RemainingBitsAndRefs on deserialize
}

fun Deployable<T>.load() {
    return Deployable<T>.fromCell(contract.getData());
}

fun Deployable<T>.store(self) {
    return contract.setData(self.toCell());
}


struct (0xba466447) Deployable_Initialize {
    stateInit: ContractState;
}

// facilityId(crc32('Deployable_ErrorNotOwner')) * 100
const ERROR_NOT_OWNER: int = 37400;


