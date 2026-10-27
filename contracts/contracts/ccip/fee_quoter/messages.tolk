// SPDX-License-Identifier: BUSL-1.1
import "types"
import "../router/messages"
import "../../lib/utils"
import "../../lib/funding/withdrawable"
import "../../lib/versioning/upgradeable"

type FeeQuoter_InMessage =
    | FeeQuoter_AddPriceUpdater
    | FeeQuoter_RemovePriceUpdater
    | FeeQuoter_UpdatePrices
    | FeeQuoter_UpdateFeeTokens
    | FeeQuoter_UpdateTokenTransferFeeConfigs
    | FeeQuoter_UpdateDestChainConfigs
    | FeeQuoter_GetValidatedFee
    | Withdrawable_Withdraw
    | Upgradeable_Upgrade;
    ;

struct (0xde852b1b) FeeQuoter_UpdatePrices {
    updates: PriceUpdates
    sendExcessesTo: address? = null;
}

// nolint:opcode : crc32('FeeQuoter_GetValidatedFee_V2')
struct (0x5eee82b8) FeeQuoter_GetValidatedFee {
    msg: Cell<Router_CCIPSend>
    context: cell? = null
}

struct (0xD0984986) FeeQuoter_UpdateFeeTokens {
    add: map<address, FeeToken> = []; // token -> config
    remove: SnakedCell<address>;
}

// --- Outgoing messages ---

// nolint:opcode : crc32('FeeQuoter_MessageValidated_V2')
struct (0xfbf78e40) FeeQuoter_MessageValidated {
    fee: Fee
    destOverheads: lisp_list<FeeQuoter_DestOverhead>?
    chainFamilySelector: uint32
    msg: Cell<Router_CCIPSend>
    context: cell? = null
}

// nolint:opcode : crc32('FeeQuoter_MessageValidationFailed_V2')
struct (0x4785cb72) FeeQuoter_MessageValidationFailed {
    error: uint256
    msg: Cell<Router_CCIPSend>
    context: cell? = null
}


// NOTE: we just merged this into UpdateFeeTokens
// UpdatePremiumMultiplierWeiPerEth { // token, multiplier }

struct (0xB2826316) FeeQuoter_UpdateTokenTransferFeeConfigs {
    updates: map<uint64, UpdateTokenTransferFeeConfig>; // destChainSelector -> updates
}

struct (0x2d2410f6) FeeQuoter_UpdateDestChainConfigs {
    updates: SnakedCell<FeeQuoter_UpdateDestChainConfig>;
}

struct (0x71DF848A) FeeQuoter_AddPriceUpdater {
    priceUpdater: address;
}

struct (0x5DFBB1BC) FeeQuoter_RemovePriceUpdater {
    priceUpdater: address;
}

// Costs associated with FeeQuoter operations
struct FeeQuoter_Costs {}

// Minimum value for calling FeeQuoter_GetValidatedFee: 5x the measured compute and 2x the forward
// fee for a MAX_DATA_CELLS message, whose reply echoes it.
fun FeeQuoter_Costs.GetValidatedFee(): int {
    return
        + grams("0.108") // computeFee (canonical snake walk of MAX_DATA_CELLS)
        + grams("0.039") // MessageValidated | MessageValidationFailed fwdFee
        ;
}

/// 5x compute and 2x forward fees measured for 8 token and 1 gas price updates; a larger report is
/// not rejected, the FeeQuoter just needs more.
fun FeeQuoter_Costs.updatePrices(): int {
    return grams("0.0255");
}
