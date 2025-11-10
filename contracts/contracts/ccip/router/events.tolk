import "../../lib/utils"

const TOPIC_RAMP_SET: int = stringCrc32("RampsSet");
struct RampsSet {
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address;
}

const TOPIC_OFF_RAMP_ADDED: int = stringCrc32("OffRampAdded");
struct OffRampAdded {
    sourceChainSelectorsAdd: SnakedCell<uint64>;
    offRampAdd: address?;
}

const TOPIC_OFF_RAMP_REMOVED: int = stringCrc32("OffRampRemoved");
struct OffRampRemoved {
    sourceChainSelectorsRemove: SnakedCell<uint64>;
    offRampRemove: address?;
}