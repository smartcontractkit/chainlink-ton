// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../lib/token_pool/types"
import "../lib/token_pool/entrypoint"

import "types"

/// @notice Pool storage: common pool data + lockbox reference.
struct Storage {
    poolData: Cell<TokenPool_Data>;
    /// Address of the JettonLockBox contract used for deposit/withdraw operations.
    lockbox: address;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}
