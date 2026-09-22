// SPDX-License-Identifier: BUSL-1.1
import "../../lib/access/ownable_2step"
import "../../lib/access/access_control"
import "../../ccip/rmn_remote/lib"
import "types"

struct RMNRemote {
    // Retained for compatibility with the existing RMN ownership interface.
    admin: Ownable2Step;
    // The audited AccessControl component manages the operation-specific
    // CURSE_ROLE and UNCURSE_ROLE memberships.
    rbac: Cell<AccessControl_Data>;
    cursedSubjects: CursedSubjects;
    forwardUpdates: map<address, ()> = [];
}

struct Storage {
    id: uint32;
    ownable: Ownable2Step;

    // TON technically doesn't have a wrapped native yet so we use an internal identifier
    wrappedNative: address;

    onRamps: map<uint64, address> = []; // destChainSelector -> onRamp address
    offRamps: map<uint64, address> = []; // sourceChainSelector -> offRamp address

    rmnRemote: Cell<RMNRemote>;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
