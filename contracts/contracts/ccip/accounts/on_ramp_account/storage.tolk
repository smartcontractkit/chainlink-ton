// SPDX-License-Identifier: BUSL-1.1

import "types"

@inline
fun OnRampAccount_Data.load(): OnRampAccount_Data {
    return OnRampAccount_Data.fromCell(contract.getData());
}

@inline
fun OnRampAccount_Data.store(self) {
    contract.setData(self.toCell());
}
