// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../../../lib/access/access_control"

/// Facility for error codes.
const JettonLockbox_FACILITY_NAME = "link.chain.ton.ccip.pools.JettonLockbox";
const JettonLockbox_FACILITY_ID = JettonLockbox_FACILITY_NAME.crc32() % 640 + 10;

const JettonLockbox_ERROR_CODE = JettonLockbox_FACILITY_ID * 100;

/// Role that can deposit/withdraw (the "authorized caller").
const OPERATOR_ROLE = "OPERATOR_ROLE".crc32();

enum JettonLockbox_Error {
	// InsufficientBalance // not supported on TVM
    TokenAmountCannotBeZero = JettonLockbox_ERROR_CODE
    RecipientCannotBeZeroAddress
    UnsupportedToken

    /// Thrown when trying to initialize the contract more than once.
    ContractAlreadyInitialized

    /// Thrown when trying to call a function on an uninitialized contract.
    ContractNotInitialized
}

struct Storage {
    id: uint64;

    minterAddress: address;
    walletAddress: address?;

    rbac: AccessControl_Data;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}

/// Returns whether the contract storage is initialized.
fun Storage.isInitialized(self): bool {
    // Should be set during init
    return self.walletAddress != null;
}
