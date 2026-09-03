// SPDX-License-Identifier: MIT
import "../../lib/access/ownable_2step"
import "types"

struct Storage {
    ownable: Ownable2Step;
    configs: map<uint256, VerifierConfig> = [];
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}
