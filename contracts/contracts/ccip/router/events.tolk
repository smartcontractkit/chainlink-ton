// SPDX-License-Identifier: BUSL-1.1
import "../../lib/utils"

const ON_RAMP_SET_TOPIC: int = "OnRampSet".crc32();
struct OnRampSet {
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address?;
}

const OFF_RAMP_ADDED_TOPIC: int = "OffRampAdded".crc32();
struct OffRampAdded {
    sourceChainSelectors: SnakedCell<uint64>;
    offRampAdded: address;
}

const OFF_RAMP_REMOVED_TOPIC: int = "OffRampRemoved".crc32();
struct OffRampRemoved {
    sourceChainSelectors: SnakedCell<uint64>;
    offRampRemoved: address;
}

const CURSED_TOPIC: int = "Cursed".crc32();
struct Cursed {
    subject: uint128;
}

const UNCURSED_TOPIC: int = "Uncursed".crc32();
struct Uncursed {
    subject: uint128;
}

const MESSAGE_TO_OFF_RAMP_BOUNCED_TOPIC = "MessageToOffRampBounced".crc32();
struct MessageToOffRampBounced {
    offRamp: address,
    execId: uint192,
}

/// Emitted when a `Router_WithdrawToTokenPool` jetton transfer bounces back. The send cannot
/// proceed and the executor is waiting, so this is emitted for observability until the failure
/// is propagated to the OnRamp.
const TOKEN_POOL_WITHDRAW_BOUNCED_TOPIC = "TokenPoolWithdrawBounced".crc32();
struct TokenPoolWithdrawBounced {
    wallet: address,
    tokenPool: address,
    queryId: uint64,
    exitCode: int32,
}
