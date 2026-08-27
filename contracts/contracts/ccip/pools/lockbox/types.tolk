// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/access/access_control"

/// Facility ID used for error code derivation.
const JettonLockBox_FACILITY_NAME = "link.chain.ton.ccip.JettonLockBox";
const JettonLockBox_FACILITY_ID = JettonLockBox_FACILITY_NAME.crc32() % 640 + 10;

/// Role granted to pool contracts that can deposit and withdraw from the lockbox.
const OPERATOR_ROLE = "OPERATOR_ROLE".crc32();

/// Event topics.
const TOPIC_DEPOSIT = "JettonLockBox_Deposit".crc32();
const TOPIC_WITHDRAWAL = "JettonLockBox_Withdrawal".crc32();

/// Error codes for JettonLockBox.
enum JettonLockBox_Error {
    /// Thrown when a deposit or withdraw amount is zero.
    TokenAmountCannotBeZero = JettonLockBox_FACILITY_ID * 100;
    /// Thrown when a withdrawal target is the zero address.
    RecipientCannotBeZeroAddress
    /// Thrown for operations on unsupported tokens (wrong wallet or uninitialized).
    UnsupportedToken
    /// Thrown when trying to initialize the contract more than once.
    ContractAlreadyInitialized
    /// Thrown when calling a function on an uninitialized contract or with invalid input.
    ContractNotInitialized
}

/// Lockbox storage: tracks the supported jetton and RBAC state.
struct Storage {
    id: uint64;

    /// Minter address of the token this lockbox holds.
    minterAddress: address;
    /// Jetton wallet address belonging to this lockbox instance.
    walletAddress: address?;

    rbac: AccessControl_Data;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}

/// Checks if the lockbox has been initialized (walletAddress is set).
fun Storage.isInitialized(self): bool {
    return self.walletAddress != null;
}
