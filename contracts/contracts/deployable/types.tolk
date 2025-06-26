struct Deployable<T> {
    owner: address;
    id: T // builder on serialize, RemainingBitsAndRefs on deserialize
}

struct (0x1234) Initialize { // TODO: use stateInit definition?
    stateInit: ContractState;
}

const ERROR_NOT_OWNER: int = 0x1;

