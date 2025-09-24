import "types.tolk"

// This needs to be in a different file than types.tolk so that the onramp compiles without name collisions
// TODO: maybe rename

// This represents FeeQuoter's DestChainConfig (not OnRamp)
struct DestChainConfig {
    config: FeeQuoterDestChainConfig;

    // TODO: split this out since updates are more frequent?
    usdPerUnitGas: Cell<GasPrice>; // TODO: it'd be nice if this wasn't split off

    tokenTransferFeeConfigs: map<address, TokenTransferFeeConfig>;
}

fun DestChainConfig.getValidatedGasPrice(self): (uint112, uint112) {
    val price = self.usdPerUnitGas.load();
    val threshold = self.config.gasPriceStalenessThreshold as int64;
    val elapsedTime = blockchain.now() - price.timestamp;

    assert(threshold == 0 || threshold > elapsedTime, Error.StaleGasPrice);

    return (price.executionGasPrice, price.dataAvailabilityGasPrice)
}


