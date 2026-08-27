// SPDX-License-Identifier: BUSL-1.1

import "types"

@inline
fun DepositAccount_Data.load(): DepositAccount_Data {
    return DepositAccount_Data.fromCell(contract.getData());
}

@inline
fun DepositAccount_Data.store(self) {
    contract.setData(self.toCell());
}
