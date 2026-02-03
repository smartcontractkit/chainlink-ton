// SPDX-License-Identifier: BUSL-1.1
import "../../lib/utils"

const ON_RAMP_SET_TOPIC: int = stringCrc32("OnRampSet");
struct OnRampSet {
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address?;
}

const OFF_RAMP_ADDED_TOPIC: int = stringCrc32("OffRampAdded");
struct OffRampAdded {
    sourceChainSelectors: SnakedCell<uint64>;
    offRampAdded: address;
}

const OFF_RAMP_REMOVED_TOPIC: int = stringCrc32("OffRampRemoved");
struct OffRampRemoved {
    sourceChainSelectors: SnakedCell<uint64>;
    offRampRemoved: address;
}

const CURSED_TOPIC: int = stringCrc32("Cursed");
struct Cursed {
    subject: uint128;
}

const UNCURSED_TOPIC: int = stringCrc32("Uncursed");
struct Uncursed {
    subject: uint128;
}

const MESSAGE_TO_OFF_RAMP_BOUNCED_TOPIC = stringCrc32("MessageToOffRampBounced");
struct MessageToOffRampBounced {
    offRamp: address,
    execId: uint192,
}
