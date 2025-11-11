import "../../lib/utils"

const ON_RAMP_SET_TOPIC: int = stringCrc32("OnRampsSet");
struct OnRampsSet {
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address;
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

const RMN_REMOTE_CURSED_TOPIC: int = stringCrc32("RMNRemoteCursed");
struct RMNRemoteCursed {
    subject: uint128;
}

const RMN_REMOTE_UNCURSED_TOPIC: int = stringCrc32("RMNRemoteUncursed");
struct RMNRemoteUncursed {
    subject: uint128;
}
