// SPDX-License-Identifier: BUSL-1.1

import "types"

@inline
fun OffRampAccount_Data.fromContractData(): OffRampAccount_Data {
    return OffRampAccount_Data.fromCell(contract.getData());
}

@inline
fun OffRampAccount_Data.storeAsContractData(self) {
    contract.setData(self.toCell());
}