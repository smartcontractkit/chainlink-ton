// SPDX-License-Identifier: BUSL-1.1

import "../lib/token_pool/entrypoint"

/// @notice Pool storage: common pool data.
struct Storage {
    poolData: Cell<TokenPool_Data>;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}
