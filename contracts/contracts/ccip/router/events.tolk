import "../../lib/utils"

const RAMP_SET_TOPIC: int = stringCrc32("RampsSet");
struct RampsSet {
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address;
}

const OFF_RAMP_ADDED_TOPIC: int = stringCrc32("OffRampAdded");
struct OffRampAdded {
    sourceChainSelectorsAdd: SnakedCell<uint64>;
    offRampAdd: address?;
}

const OFF_RAMP_REMOVED_TOPIC: int = stringCrc32("OffRampRemoved");
struct OffRampRemoved {
    sourceChainSelectorsRemove: SnakedCell<uint64>;
    offRampRemove: address?;
}

const RMN_REMOTE_CURSED_TOPIC: int = stringCrc32("RMNRemoteCursed");
struct RMNRemoteCursed {
    subject: uint128;
}

const RMN_REMOTE_UNCURSED_TOPIC: int = stringCrc32("RMNRemoteUncursed");
struct RMNRemoteUncursed {
    subject: uint128;
}
