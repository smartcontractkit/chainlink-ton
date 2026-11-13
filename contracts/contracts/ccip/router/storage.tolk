// SPDX-License-Identifier: BUSL-1.1
import "../../lib/access/ownable_2step"
import "../../ccip/rmn_remote/lib"

struct RMNRemote {
    // Authoritative curse policy for the lane. TokenPools embed the same struct
    // but their copies are independent; nothing is mirrored between them.
    policy: CursePolicy;
    forwardUpdates: map<address, ()> = [];
}

// nolint:opcode : storage layout version
struct (0xb17ecdf5) Router_Storage_V1_7_0 {
    id: uint32;
    ownable: Ownable2Step;

    onRamps: map<uint64, address> = []; // destChainSelector -> onRamp address
    offRamps: map<uint64, address> = []; // sourceChainSelector -> offRamp address

    rmnRemote: Cell<RMNRemote>;
}

fun Router_Storage_V1_7_0.load(): Router_Storage_V1_7_0 {
    return Router_Storage_V1_7_0.fromCell(contract.getData());
}

fun Router_Storage_V1_7_0.store(self) {
    return contract.setData(self.toCell());
}
