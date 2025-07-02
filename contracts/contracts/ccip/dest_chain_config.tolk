import "types.tolk";
import "../deployable/types.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "utils.tolk";
import "../lib/utils.tolk";

const VAL_1E5:  uint256 = 100000;
const VAL_1E14: uint256 = 100000000000000;
const VAL_1E16: uint256 = 10000000000000000;
const VAL_1E18: uint256 = 1000000000000000000;

// TODO:
const TON_2_EVM_MESSAGE_FIXED_BYTES = 1;
const TON_2_EVM_MESSAGE_FIXED_BYTES_PER_TOKEN = 1;

const CCIP_LOCK_OR_BURN_V1_RET_BYTES = 32;

const CHAIN_FAMILY_SELECTOR_EVM:   uint32 = 0x2812d52c;
const CHAIN_FAMILY_SELECTOR_SVM:   uint32 = 0x1e10bdc4;
const CHAIN_FAMILY_SELECTOR_APTOS: uint32 = 0xac77ffec;
const CHAIN_FAMILY_SELECTOR_SUI:   uint32 = 0xc4e05953;

fun DestChainConfig_Storage.load() {
    return DestChainConfig_Storage.fromCell(contract.getData());
}

fun DestChainConfig_Storage.store(self) {
    return contract.setData(self.toCell());
}

type Msg = Initialize | GetValidatedFee;

fun onInternalMessage(msgCell: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs     = msgCell.beginParse();
    val flags  = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { return; } // ignore all bounced messages
    val sender = cs.loadAddress();

    val msg = Msg.fromSlice(msgBody);

    match (msg) {
        Initialize => {
            // TODO: if we receive Initialize {} treat that as an update (make sure to assert caller == owner again)
            // ignore tokenTransferFeeConfigs part of the value since that's a separate update call? or merge the two
        }
        GetValidatedFee => { onGetValidatedFee(msg) }
    }
}

fun DestChainConfig_Storage.getValidatedGasPrice(self): (uint112, uint112) {
    val price = self.usdPerUnitGas.load();
    val threshold = self.config.gasPriceStalenessThreshold as int64;
    val elapsedTime = blockchain.now() - price.timestamp;

    assert(threshold == 0 || threshold > elapsedTime, ERROR_STALE_GAS_PRICE);

    return (price.executionGasPrice, price.dataAvailabilityGasPrice)
}

fun onGetValidatedFee(payload: GetValidatedFee) {
    val msg = payload.msg;
    val st = DestChainConfig_Storage.load();
    // validate message came from trusted fee quoter (owner)

    assert(st.config.isEnabled, ERROR_DEST_CHAIN_NOT_ENABLED);
    // TODO: assert(cfg.feeTokens contains msg.feeToken, ERROR_FEE_TOKEN_NOT_SUPPORTED);

    var gasLimit = 0;
    // NOTE: we could deploy distinct contracts to cut down on code
    // match (cfg.chainFamilySelector) {
    //     CHAIN_FAMILY_SELECTOR_EVM | CHAIN_FAMILY_SELECTOR_APTOS | CHAIN_FAMILY_SELECTOR_SUI => { } // resolveGenericGasLimit()
    //     CHAIN_FAMILY_SELECTOR_SVM => { } // resolveSVMGasLimit()
    // }
    // validateDestFamilyAddress(cfg.chainFamilySelector, receiver, gasLimit);

    // TODO: this can throw and bounce the message
    val (executionGasPrice, dataAvailabilityGasPrice) = st.getValidatedGasPrice();

    // Network fee

    var tokensIter = Iterator<TokenAmount>.new(msg.tokenAmounts);
    var (tokenCount, premiumFeeUsdWei, tokenTransferGas, tokenTransferBytesOverhead) = (0, st.config.networkFeeUsdCents as uint256, 0, 0);
    if (!tokensIter.empty()) {
        val tokenPrices = Map<uint224>.new(); // TODO: pass this through from feeQuoter
        (tokenCount, premiumFeeUsdWei, tokenTransferGas, tokenTransferBytesOverhead) = getTokenTransferCost(st, mutate tokensIter, tokenPrices);
    };

    // Execution cost

    // Calculate calldata gas cost while accounting for EIP-7623 variable calldata gas pricing
    // This logic works for EVMs post Pectra upgrade, while being backwards compatible with pre-Pectra EVMs.
    // This calculation is not exact, the goal is to not lose money on large payloads.
    // The fixed OCR report calldata overhead gas is accounted for in `dest_gas_overhead`.
    // It is not included in the calculation below for simplicity.
    val (_cellsCount, dataBitsSize, _cellRefs, traversed) = msg.data.calculateSize(99); // TODO: use Iterator.lenBytes
    assert(traversed, ERROR_INVALID_MSG_DATA);
    assert(dataBitsSize % 8 == 0, ERROR_INVALID_MSG_DATA);
    val calldataLen = dataBitsSize / 8 as uint256 + tokenTransferBytesOverhead;
    var calldataGas = calldataLen * st.config.destGasPerPayloadByteBase as uint256;
    val calldataThreshold = st.config.destGasPerPayloadByteThreshold as uint256;
    if (calldataLen > calldataThreshold) {
        val baseCalldataGas = st.config.destGasPerPayloadByteBase as uint256 * calldataThreshold;
        val extraBytes = calldataLen - calldataThreshold;
        val extraCalldataGas = extraBytes * st.config.destGasPerPayloadByteHigh as uint256;
        calldataGas = baseCalldataGas + extraCalldataGas;
    }
    val executionGas = gasLimit + st.config.destGasOverhead as uint256 + calldataGas + tokenTransferGas;

    val executionCost = executionGasPrice
        * executionGas
        * st.config.gasMultiplierWeiPerEth as uint256;

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
        * st.config.destGasPerDataAvailabilityByte as uint256
        + st.config.destDataAvailabilityOverheadGas as uint256;

    // data_availability_gas_price is in 18 decimals, dest_data_availability_multiplier_bps is in 4 decimals
    // We pad 14 decimals to bring the result to 36 decimals, in line with token bps and execution fee.
    val dataAvailabilityCost = dataAvailabilityGasPrice
        * dataAvailabilityGas
        * st.config.destDataAvailabilityMultiplierBps as uint256
        * VAL_1E14;

    val messageValidatedMsg = createMessage({
        bounce: false,
        value: ton("0.05"), // TODO:
        dest: st.owner,
        body: MessageValidated {
            msg: msg.toCell(),
            caller: payload.caller,
            fees: Fees {
                premiumFeeUsdWei,
                executionCost,
                dataAvailabilityCost,
            }.toCell()
        },
    });
    messageValidatedMsg.send(SEND_MODE_REGULAR);
}

fun getTokenTransferCost(st: DestChainConfig_Storage, mutate tokens: Iterator<TokenAmount>, tokenPrices: Map<uint224>): (int, uint256, uint32, uint32) {
    var tokenTransferFeeWei: uint256 = 0;
    var tokenTransferGas: uint32 = 0;
    var tokenTransferBytesOverhead: uint32 = 0;

    var count = 0;

    while (!tokens.empty()) {
        val tokenAmount = tokens.next();
        count += 1;

        // TODO: use different error code than dest chain selector
        val transferFeeConfig = st.tokenTransferFeeConfigs.mustGet(tokenAmount.token, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
        if (!transferFeeConfig.isEnabled) {
            // If the token has no specific overrides configured, we use the global defaults.
            tokenTransferFeeWei +=((st.config.defaultTokenFeeUsdCents as uint256) * VAL_1E16);
            tokenTransferGas += st.config.defaultTokenDestGasOverhead;
            tokenTransferBytesOverhead += CCIP_LOCK_OR_BURN_V1_RET_BYTES;
        } else {
            // NOTE: for this calc to work we'd need to lookup the token prices in feeQuoter then pass into here
            // this also makes sense so we do the token pricing lookup all at the same time, vs for it to have a chance to drift

            // TODO: a lot of the as uint256 annotations seem to be unnecessary

            var bpsFeeUsdWei = 0;
            if (transferFeeConfig.deciBps > 0) {
                val tokenPrice = tokenPrices.mustGet(tokenAmount.token, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);

                // Calculate token transfer value, then apply fee ratio
                // ratio represents multiples of 0.1bps, or 1e-5
                val tokenUsdValue = tokenAmount.amount as uint256 * tokenPrice / VAL_1E18;
                bpsFeeUsdWei = (tokenUsdValue * (transferFeeConfig.deciBps as uint256)) / VAL_1E5;
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
