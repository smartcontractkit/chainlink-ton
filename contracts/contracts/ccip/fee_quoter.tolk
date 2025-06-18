import "types.tolk";
import "../deployable/types.tolk";
import "utils.tolk";

struct Storage {
    owner: address;

    maxFeeJuelsPerMsg: uint256;
    linkToken: address;
    tokenPriceStalenessThreshold: uint64;

    // NOTE: for now we're embedding token/gas price data
    usdPerToken: Map<TimestampedPrice>; // (sdict len=36*8) address -> TimestampedPrice
    // TODO: can this sit on DestChain?
    usdPerUnitGasByDestChain: UMap<uint64, TimestampedPrice>; // (idict len=64) chainSelector -> TimestampedPrice

    premiumMultiplierWeiPerEth: Map<uint64>; // (sdict len=36*8) token address -> multiplier

    // TODO: both fee quoter and onramp store DestChainConfig, can we share a single subcontract?
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

struct TimestampedPrice {
    value: uint224;
    timestamp: uint64;
}

fun onInternalMessage(msgCell: cell, msgBody: slice) {
}

fun onUpdatePrices(priceUpdates: PriceUpdates) {
    // TODO: validate that price updates came from the offramp

    var st = Storage.load();
    val timestamp = blockchain.now();

    var iter = Iterator<TokenPriceUpdate>.new(priceUpdates.tokenPriceUpdates, 36*8+256);
    while (!iter.empty()) {
        val update = iter.next();

        st.usdPerToken.set(update.sourceToken as slice, TimestampedPrice {
            value: update.usdPerToken,
            timestamp
        })
    }

    var iter2 = Iterator<GasPriceUpdate>.new(priceUpdates.gasPriceUpdates, 64+256);
    while (!iter2.empty()) {
        val update = iter2.next();

        st.usdPerUnitGasByDestChain.set(update.destChainSelector, TimestampedPrice {
            value: update.usdPerUnitGas,
            timestamp
        })
    }

    // TODO: persist state changes
}

fun onGetValidatedFee(msg: CCIPSend) {
    // call getValidatedFee on DestChainConfig
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: 0,
        dest: {
            stateInit: {
                code: createEmptyCell(),
                data: Deployable {
                    owner: contract.getAddress(),
                    ty: 2, // TODO: alias constant for DestChainConfig
                    id: msg.destChainSelector.toCell(),
                }.toCell(),
            }
        }
        // TODO:
        // body: GetValidatedFee {}
    })
    // NOTE: this can get bounced if dest chain doesn't exist, in which case we should send
    // an error notification to the user and refund

    // pass through information on token/jetton amounts
}

fun onMessageValidated(msg: null) {
    // convert gas cost to actual fee
    // total_cost_usd = gas * gas_cost + premium_fee_usd_wei + data_availability_cost_usd;
    // fee_token_cost = total_cost_usd / fee_token_price.value

    // validate user transferred enough value
    // else refund and notify
    // call publish on onramp
}

// apply_premium_multiplier_wei_per_eth_updates??

// fun type(): String {
//     return "com.chainlink.ton.ccip.FeeQuoter";
// }

// fun version(): String {
//     return "1.0.0";
// }
