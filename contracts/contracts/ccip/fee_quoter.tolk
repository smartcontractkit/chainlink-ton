import "types.tolk";
import "utils.tolk";

struct Storage {
    owner: address;

    maxFeeJuelsPerMsg: uint256;
    linkToken: address;
    tokenPriceStalenessThreshold: uint64;

    // NOTE: for now we're embedding token/gas price data
    usdPerToken: Map<TimestampedPrice>; // (sdict len=36*8) address -> TimestampedPrice
    // TODO: can this sit on DestChain?
    usdPerUnitGasByDestChain: UMap<uint64, TimestampedPrice>; // (idict len=32) chainSelector -> TimestampedPrice

    // premium_multiplier_wei_per_eth? how do we handle this

    // TODO: both fee quoter and onramp store DestChainConfig, can we share a single subcontract?
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
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

        // TODO: having to set len here isn't ideal
        st.usdPerToken.set(update.sourceToken as slice, TimestampedPrice {
            value: update.usdPerToken as uint224,
            timestamp
        })
    }

    var iter2 = Iterator<GasPriceUpdate>.new(priceUpdates.gasPriceUpdates, 64+256);
    while (!iter2.empty()) {
        val update = iter2.next();

        // TODO: having to set len here isn't ideal
        st.usdPerUnitGasByDestChain.set(update.destChainSelector, TimestampedPrice {
            value: update.usdPerUnitGas as uint224,
            timestamp
        })
    }

    // TODO: persist state changes
}

fun onGetValidatedFee(destChainSelector: uint64, msg: CCIPSend) {
    // let addr = initOf(DestChainConfig, self, destChainSelector)
    // call getValidatedFee on DestChainConfig
    // pass through information on token/jetton amounts
}

fun onMessageValidated(msg: null) {
    // convert gas cost to actual fee
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
