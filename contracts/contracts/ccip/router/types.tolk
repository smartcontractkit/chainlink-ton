// SPDX-License-Identifier: BUSL-1.1
import "../../lib/utils"

const Router_FACILITY_NAME = "link.chain.ton.ccip.Router";
const Router_FACILITY_ID = Router_FACILITY_NAME.crc32() % 640 + 10;  // 571
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

struct OnRamps {
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address?;
}

struct OffRamps {
    sourceChainSelectors: SnakedCell<uint64>;
    offRamp: address;
}

struct Router_TokenRegistryDeployment {
    deployableCode: cell;
    tokenRegistryCode: cell;
}
