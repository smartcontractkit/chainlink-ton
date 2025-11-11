import "types"
import "../router/messages"
import "../../lib/utils"
import "../../lib/funding/withdrawable"
import "../../lib/versioning/upgradeable"
import "../ccipsend_executor/messages"

type FeeQuoter_InMessage =
    | FeeQuoter_AddPriceUpdater
    | FeeQuoter_RemovePriceUpdater
    | FeeQuoter_UpdatePrices
    | FeeQuoter_UpdateFeeTokens
    | FeeQuoter_UpdateTokenTransferFeeConfigs
    | FeeQuoter_UpdateDestChainConfigs
    | FeeQuoter_GetValidatedFee<cell> // marked as cell since we never attempt to load the metadata
    | Withdrawable_Withdraw
    | Upgradeable_Upgrade;
    ;

struct (0x20000001) FeeQuoter_UpdatePrices {
    updates: PriceUpdates
}

// crc32('FeeQuoter_GetValidatedFee')
struct (0x7496FF56) FeeQuoter_GetValidatedFee<C> {
    msg: Cell<Router_CCIPSend>
    metadata: Cell<C>
}

// crc32('FeeQuoter_UpdateFeeTokens')
struct (0xD0984986) FeeQuoter_UpdateFeeTokens {
    add: map<address, FeeToken>; // token -> config
    remove: SnakedCell<address>;
}

// NOTE: we just merged this into UpdateFeeTokens
// struct (0x10000003) UpdatePremiumMultiplierWeiPerEth { // token, multiplier }

// crc32('FeeQuoter_UpdateTokenTransferFeeConfigs')
struct (0xB2826316) FeeQuoter_UpdateTokenTransferFeeConfigs {
    // TODO: would these be more efficient as snakedata (key, value)?
    updates: map<uint64, UpdateTokenTransferFeeConfig>; // destChainSelector -> updates
}

// crc32('FeeQuoter_UpdateDestChainConfig')
struct (0x29950BAA) FeeQuoter_UpdateDestChainConfigs {
    updates: cell; // vec<FeeQuoter_UpdateDestChainConfig>
}

struct (0x71DF848A) FeeQuoter_AddPriceUpdater {
    priceUpdater: address;
}

struct (0x5DFBB1BC) FeeQuoter_RemovePriceUpdater {
    priceUpdater: address;
}

// Costs associated with FeeQuoter operations
struct FeeQuoter_Costs {}

// Minimum value for calling FeeQuoter_GetValidatedFee
@inline
fun FeeQuoter_Costs.GetValidatedFee(): int {
    return min(
        ton("0.05") // MessageValidated fwdFee
        + SendExecutor_Costs.MessageValidated(),
        ton("0.05") // MessageValidationFailed fwdFee
        + SendExecutor_Costs.MessageValidationFailed()
    );
}
