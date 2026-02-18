// SPDX-License-Identifier: BUSL-1.1
import "../../lib/utils"

const Router_FACILITY_NAME = "link.chain.ton.ccip.Router";
// getFacilityId(stringCrc32(Router_FACILITY_NAME));
const Router_FACILITY_ID = 571;

struct OnRamps {
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address?;
}

struct OffRamps {
    sourceChainSelectors: SnakedCell<uint64>;
    offRamp: address;
}
