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

const MESSAGE_TO_OFF_RAMP_BOUNCED_TOPIC = "MessageToOffRampBounced".crc32();
struct MessageToOffRampBounced {
    offRamp: address,
    execId: uint192,
}
