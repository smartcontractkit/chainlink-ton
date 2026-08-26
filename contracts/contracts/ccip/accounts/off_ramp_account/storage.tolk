// SPDX-License-Identifier: BUSL-1.1

import "types"

@inline
fun OffRampAccount_Data.load(): OffRampAccount_Data {
    return OffRampAccount_Data.fromCell(contract.getData());
}

@inline
fun OffRampAccount_Data.store(self) {
    contract.setData(self.toCell());
}
