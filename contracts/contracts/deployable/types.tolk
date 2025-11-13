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

type Deployable_InMessage =
    | Deployable_Initialize
    | Deployable_InitializeAndExecute
    ;

struct (0xba466447) Deployable_Initialize {
    stateInit: ContractState;
}

struct (0xe95e1156) Deployable_InitializeAndExecute {
    stateInit: ContractState;
    message: cell;
}

//TODO: crc32('Deployable_ErrorNotOwner')
const ERROR_NOT_OWNER: int = 0x1;

