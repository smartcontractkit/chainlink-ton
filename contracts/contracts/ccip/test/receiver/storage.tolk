// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/access/ownable_2step"

struct Storage {
    id: uint32;
    ownable: Ownable2Step;
    authorizedCaller: address; // When using the contract in CCIP, the authorized caller must be the router
    behavior: TestReceiver_Behavior;
}

enum TestReceiver_Behavior : uint8 {
    Accept = 0,
    RejectAll
    ConsumeAllGas
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
