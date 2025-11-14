import "../common/types"
import "../fee_quoter/types"
import "../../lib/utils"

struct OnRamps {
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address;
}

struct OffRamps {
    sourceChainSelectors: SnakedCell<uint64>;
    offRamp: address;
}
