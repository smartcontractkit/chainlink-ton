import "types.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "utils.tolk";

const VAL_1E5: uint256 = 100000;
const VAL_1E14: uint256 = 100000000000000;
const VAL_1E16: uint256 = 10000000000000000;
const VAL_1E18: uint256 = 1000000000000000000;

// TODO:
const TON_2_EVM_MESSAGE_FIXED_BYTES = 1;
const TON_2_EVM_MESSAGE_FIXED_BYTES_PER_TOKEN = 1;

const CCIP_LOCK_OR_BURN_V1_RET_BYTES = 32;

const CHAIN_FAMILY_SELECTOR_EVM: uint32 = 0x2812d52c;
const CHAIN_FAMILY_SELECTOR_SVM: uint32 = 0x1e10bdc4;
const CHAIN_FAMILY_SELECTOR_APTOS: uint32 = 0xac77ffec;
const CHAIN_FAMILY_SELECTOR_SUI: uint32 = 0xc4e05953;

struct GasPrice {
    executionGasPrice: uint112;
    dataAvailabilityGasPrice: uint112;
    timestamp: uint64;
}

// This represents FeeQuoter's DestChainConfig (not OnRamp)
struct Storage {
    owner: address;

    isEnabled: bool;
    maxNumberOfTokensPerMsg: uint16;
    maxDataBytes: uint32;
    maxPerMsgGasLimit: uint32;
    destGasOverhead: uint32;
    destGasPerPayloadByteBase: uint8;
    destGasPerPayloadByteHigh: uint8;
    destGasPerPayloadByteThreshold: uint16;
    destDataAvailabilityOverheadGas: uint32;
    destGasPerDataAvailabilityByte: uint16;
    destDataAvailabilityMultiplierBps: uint32;

    chainFamilySelector: uint32; // 4 bytes
    enforceOutOfOrder: bool;

    defaultTokenFeeUsdCents: uint16;
    defaultTokenDestGasOverhead: uint32;
    defaultTxGasLimit: uint32;

    // Multiplier for gas costs, 1e18 based so 11e17 = 10% extra cost.
    gasMultiplierWeiPerEth: uint64;
    gasPriceStalenessThreshold: uint32;
    networkFeeUsdCents: uint32;

    usdPerUnitGas: Cell<GasPrice>; // TODO: it'd be nice if this wasn't split off

    tokenTransferFeeConfigs: Map<TokenTransferFeeConfig>; // (sdict) address -> TokenTransferFeeConfig
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

struct TokenTransferFeeConfig {
    isEnabled: bool;
    minFeeUsdCents: uint32;
    maxFeeUsdCents: uint32;
    deciBps: uint16;
    destGasOverhead: uint32;
    destBytesOverhead: uint32;
}

fun onInternalMessage(msgCell: cell, msgBody: slice) {
}

fun Storage.getValidatedGasPrice(self): (uint112, uint112) {
    val price = self.usdPerUnitGas.load();
    val threshold = self.gasPriceStalenessThreshold as int64;
    val elapsedTime = blockchain.now() - price.timestamp;

    assert(threshold == 0 || threshold > elapsedTime, ERROR_STALE_GAS_PRICE);

    return (price.executionGasPrice, price.dataAvailabilityGasPrice)
}

fun onGetValidatedFee(msg: CCIPSend) {
    val cfg = Storage.load();
    // validate message came from trusted fee quoter (owner)

    assert(cfg.isEnabled, ERROR_DEST_CHAIN_NOT_ENABLED);
    // TODO: assert(cfg.feeTokens contains msg.feeToken, ERROR_FEE_TOKEN_NOT_SUPPORTED);

    var gasLimit = 0;
    // NOTE: we could deploy distinct contracts to cut down on code
    // match (cfg.chainFamilySelector) {
    //     CHAIN_FAMILY_SELECTOR_EVM | CHAIN_FAMILY_SELECTOR_APTOS | CHAIN_FAMILY_SELECTOR_SUI => { } // resolveGenericGasLimit()
    //     CHAIN_FAMILY_SELECTOR_SVM => { } // resolveSVMGasLimit()
    // }

    // validateDestFamilyAddress(cfg.chainFamilySelector, receiver, gasLimit);

    // TODO: this can throw and bounce the message
    val (executionGasPrice, dataAvailabilityGasPrice) = cfg.getValidatedGasPrice();

    // Network fee

    var tokensIter = Iterator<TokenAmount>.new(msg.tokenAmounts);
    var (tokenCount, premiumFeeUsdWei, tokenTransferGas, tokenTransferBytesOverhead) = (0, cfg.networkFeeUsdCents as uint256, 0, 0);
    if (!tokensIter.empty()) {
        val tokenPrices = Map<uint224>.new(36*8); // TODO: pass this through from feeQuoter
        (tokenCount, premiumFeeUsdWei, tokenTransferGas, tokenTransferBytesOverhead) = getTokenTransferCost(cfg, mutate tokensIter, tokenPrices);
    };

    // getDataAvailabilityMultiplier()

    // Execution cost

    // Calculate calldata gas cost while accounting for EIP-7623 variable calldata gas pricing
    // This logic works for EVMs post Pectra upgrade, while being backwards compatible with pre-Pectra EVMs.
    // This calculation is not exact, the goal is to not lose money on large payloads.
    // The fixed OCR report calldata overhead gas is accounted for in `dest_gas_overhead`.
    // It is not included in the calculation below for simplicity.
    val (_cellsCount, dataBitsSize, _cellRefs, traversed) = msg.data.calculateSize(99); // TODO: find a constant
    assert(traversed, ERROR_INVALID_MSG_DATA);
    assert(dataBitsSize % 8 == 0, ERROR_INVALID_MSG_DATA);
    val calldataLen = dataBitsSize / 8 as uint256 + tokenTransferBytesOverhead;
    var calldataGas = calldataLen * cfg.destGasPerPayloadByteBase as uint256;
    val calldataThreshold = cfg.destGasPerPayloadByteThreshold as uint256;
    if (calldataLen > calldataThreshold) {
        val baseCalldataGas = cfg.destGasPerPayloadByteBase as uint256 * calldataThreshold;
        val extraBytes = calldataLen - calldataThreshold;
        val extraCalldataGas = extraBytes * cfg.destGasPerPayloadByteHigh as uint256;
        calldataGas = baseCalldataGas + extraCalldataGas;
    }
    val executionGas = gasLimit + cfg.destGasOverhead as uint256 + calldataGas + tokenTransferGas;

    val executionCost = executionGasPrice
        * executionGas
        * cfg.gasMultiplierWeiPerEth as uint256;

    // Data availability cost

    // Sums up byte lengths of fixed message fields and dynamic message fields.
    // Fixed message fields do account for the offset and length slot of the dynamic fields.
    val dataAvailabilityLengthBytes = TON_2_EVM_MESSAGE_FIXED_BYTES
        + calldataLen
        + tokenCount as uint256 * TON_2_EVM_MESSAGE_FIXED_BYTES_PER_TOKEN
        + tokenTransferBytesOverhead;

    // dest_data_availability_overhead_gas is a separate config value for flexibility to be updated
    // independently of message cost. Its value is determined by CCIP lane implementation, e.g.
    // the overhead data posted for OCR.
    val dataAvailabilityGas = dataAvailabilityLengthBytes
        * cfg.destGasPerDataAvailabilityByte as uint256
        + cfg.destDataAvailabilityOverheadGas as uint256;

    // data_availability_gas_price is in 18 decimals, dest_data_availability_multiplier_bps is in 4 decimals
    // We pad 14 decimals to bring the result to 36 decimals, in line with token bps and execution fee.
    val dataAvailabilityCost = dataAvailabilityGasPrice
        * dataAvailabilityGas
        * cfg.destDataAvailabilityMultiplierBps as uint256
        * VAL_1E14;

    // val premiumMultiplier = fee_token_config.premium_multiplier_wei_per_eth as uint256;
    // At this step, every fee component has been raised to 36 decimals
    // let feeTokenValue =
    //     (network_fee.premium * premium_multiplier) + execution_cost + data_availability_cost;

    // Fee token value is in 36 decimals
    // Fee token price is in 18 decimals USD for 1e18 smallest token denominations.
    // The result is the fee in the fee tokens smallest denominations (e.g. lamport for Sol).
    // let fee_token_amount = (fee_token_value / fee_token_price)

    return (premiumFeeUsdWei, executionCost, dataAvailabilityCost)
}

fun getTokenTransferCost(cfg: Storage, mutate tokens: Iterator<TokenAmount>, tokenPrices: Map<uint224>): (int, uint256, uint32, uint32) {
    var tokenTransferFeeWei: uint256 = 0;
    var tokenTransferGas: uint32 = 0;
    var tokenTransferBytesOverhead: uint32 = 0;

    var count = 0;

    while (!tokens.empty()) {
        val tokenAmount = tokens.next();
        count += 1;

        val (maybeCfg, exists) = cfg.tokenTransferFeeConfigs.get(tokenAmount.token as slice);
        assert(exists, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
        val transferFeeConfig = maybeCfg!;

        if (!transferFeeConfig.isEnabled) {
            // If the token has no specific overrides configured, we use the global defaults.
            tokenTransferFeeWei +=((cfg.defaultTokenFeeUsdCents as uint256) * VAL_1E16);
            tokenTransferGas += cfg.defaultTokenDestGasOverhead;
            tokenTransferBytesOverhead += CCIP_LOCK_OR_BURN_V1_RET_BYTES;
        } else {
            // NOTE: for this calc to work we'd need to lookup the token prices in feeQuoter then pass into here
            // this also makes sense so we do the token pricing lookup all at the same time, vs for it to have a chance to drift

            var bpsFeeUsdWei = 0;
            if (transferFeeConfig.deciBps > 0) {
                val (maybeTokenPrice, exists) = tokenPrices.get(tokenAmount.token as slice);
                assert(exists, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
                val tokenPrice = maybeTokenPrice!;

                // Calculate token transfer value, then apply fee ratio
                // ratio represents multiples of 0.1bps, or 1e-5

                // let token_usd_value =
                //     calc_usd_value_from_token_amount(
                //         local_token_amount, token_price.value
                //     );
                // bps_fee_usd_wei =
                //     (token_usd_value * (transfer_fee_config.deci_bps as u256))
                //         / VAL_1E5;
            };

            tokenTransferGas += transferFeeConfig.destGasOverhead;
            tokenTransferBytesOverhead += transferFeeConfig.destBytesOverhead;

            var minFeeUsdWei = (transferFeeConfig.minFeeUsdCents as uint256) * VAL_1E16;
            var maxFeeUsdWei = (transferFeeConfig.maxFeeUsdCents as uint256) * VAL_1E16;
            tokenTransferFeeWei += min(maxFeeUsdWei, max(minFeeUsdWei, bpsFeeUsdWei));
        }
    }
    return (count, tokenTransferFeeWei, tokenTransferGas, tokenTransferBytesOverhead);
}

get typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.fee_quoter.DestChainConfig", "1.0.0");
 }
