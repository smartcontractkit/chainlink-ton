struct Deployable<T> {
    owner: address;
    id: T // builder on serialize, RemainingBitsAndRefs on deserialize
}

fun Deployable<Namespaced<T>>.new(namespace: Namespace, owner: address, id: T): Cell<Deployable<Namespaced<T>>> {
    return Deployable<Namespaced<T>> {
        owner,
        id: Namespaced<T> {
            namespace,
            id,
        },
    }.toCell();
}

struct Namespaced<T> {
    namespace: Namespace;
    id: T;
}

type Namespace = uint32;

fun Deployable<T>.load() {
    return Deployable<T>.fromCell(contract.getData());
}

fun Deployable<T>.store(self) {
    return contract.setData(self.toCell());
}

type Deployable_InMessage =
    | Deployable_Initialize
    | Deployable_InitializeAndSend
    ;

// Message for Initializing the Deployable contract. It sets the code and data of the contract.
struct (0xba466447) Deployable_Initialize {
    stateInit: ContractState;
}

// This message initializes the Deployable contract and immediately sends a message to itself to execute some logic. It allows to carry the message value.
struct (0xe95e1156) Deployable_InitializeAndSend {
    stateInit: ContractState;
    selfMessage: Deployable_Message;
}

struct Deployable_Message {
    value: coins;
    body: cell;
}

//TODO: crc32('Deployable_ErrorNotOwner')
const ERROR_NOT_OWNER: int = 0x1;

