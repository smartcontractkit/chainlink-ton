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

/// Deployables ID of a Router-owned deposit account, in the OnRampAccount or DepositAccount
/// namespace.
///
/// @dev The token is part of the ID so an account can only ever hold one jetton: were it
///      token-agnostic, a malicious minter could hand out the jetton wallet of a *different*
///      jetton owned by the same account.
struct Router_DepositAccountID {
    user: address;
    token: address;
}
