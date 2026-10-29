// SPDX-License-Identifier: BUSL-1.1
/// JettonLockBox types, error codes, and storage.

import "../../../lib/access/access_control"
import "../../../lib/gas"

/// Facility ID used for error code derivation.
const JettonLockBox_FACILITY_NAME = "link.chain.ton.ccip.pool.JettonLockBox";
const JettonLockBox_FACILITY_ID = JettonLockBox_FACILITY_NAME.crc32() % 640 + 10;

/// Role granted to pool contracts that can deposit and withdraw from the lockbox.
const OPERATOR_ROLE = "OPERATOR_ROLE".crc32();

/// Event topics.
const TOPIC_DEPOSIT = "JettonLockBox_Deposit".crc32();
const TOPIC_WITHDRAWAL = "JettonLockBox_Withdrawal".crc32();

/// Storage rent reserve to keep the contract alive.
const MIN_GRAM_TO_RESERVE: int = grams("0.05");

/// Minimum value the init message must carry on top of the rent reserve
const MIN_GRAM_TO_INIT: int = grams("0.05");

/// The estimated lockbox's own work on `JettonLockBox_Withdraw`: validation, the withdrawal log, etc.
/// Does not include fwdFee or the gas/value used by the jetton wallet for the actual token transfer.
const JettonLockBox_WITHDRAW_GAS_UNITS = BUDGET_UNITS_LVL1_LOW;

/// Error codes for JettonLockBox. FACILITY_ID = 567, so codes start at 56700.
enum JettonLockBox_Error {
    /// Thrown when a deposit or withdraw amount is zero.
    TokenAmountCannotBeZero = JettonLockBox_FACILITY_ID * 100; // 56700
    /// Thrown when a withdrawal target is the zero address.
    RecipientCannotBeZeroAddress // 56701
    /// Thrown for operations on unsupported tokens (wrong wallet or uninitialized).
    UnsupportedToken // 56702
    /// Thrown when trying to initialize the contract more than once.
    ContractAlreadyInitialized // 56703
    /// Thrown when calling a function on an uninitialized contract or with invalid input.
    ContractNotInitialized // 56704
    /// Thrown when a deposit or bounced withdrawal has a missing or malformed forward payload.
    MissingOrMalformedForwardPayload // 56705
    /// Thrown when a caller other than the bound initializer tries to initialize the lockbox.
    UnauthorizedInitializer // 56706
    /// Thrown when the init message does not carry enough value to cover the rent reserve and init replies.
    NotEnoughValue // 56707
}

/// Lockbox storage: tracks the supported jetton and RBAC state.
struct Storage {
    id: uint64;

    /// Address allowed to initialize this lockbox, bound at deployment (stateInit).
    initializer: address;

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
