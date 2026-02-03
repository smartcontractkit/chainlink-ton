// SPDX-License-Identifier: BUSL-1.1
import "../../lib/access/ownable_2step"
import "../../ccip/rmn_remote/lib"

struct RMNRemote {
    admin: Ownable2Step;
    cursedSubjects: CursedSubjects;
    forwardUpdates: map<address, ()>;
}

struct Storage {
    id: uint32;
    ownable: Ownable2Step;

    // TON technically doesn't have a wrapped native yet so we use an internal identifier
    wrappedNative: address;

    onRamps: map<uint64, address>; // destChainSelector -> onRamp address
    offRamps: map<uint64, address>; // sourceChainSelector -> offRamp address

    rmnRemote: Cell<RMNRemote>,
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
