import "@stdlib/lisp-lists"
import "../types";
import "../../lib/access/ownable_2step";
import "../../deployable/types";
import "../../lib/upgrades/type_and_version";
import "../../lib/utils";
import "messages"

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

struct Storage {
    ownable: Ownable2Step;

    maxFeeJuelsPerMsg: uint96;
    linkToken: address;
    tokenPriceStalenessThreshold: uint64;

    // TODO: this is on DestChain instead (same as Solana)
    // usdPerUnitGasByDestChain: map<uint64, TimestampedPrice>; // (idict len=64) chainSelector -> TimestampedPrice
    usdPerToken: map<address, TimestampedPrice>;
    // TODO: use presence in this map to validate a token as feeToken
    premiumMultiplierWeiPerEth: map<address, uint64>;

    destChainConfigs: map<uint64, DestChainConfig>
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

// This represents FeeQuoter's DestChainConfig (not OnRamp)
struct DestChainConfig {
    config: FeeQuoterDestChainConfig;

    // TODO: split this out since updates are more frequent?
    usdPerUnitGas: Cell<GasPrice>; // TODO: it'd be nice if this wasn't split off

    tokenTransferFeeConfigs: map<address, TokenTransferFeeConfig>;
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy FeeQuoter_InMessage.fromSlice(in.body);
    match (msg) {
        FeeQuoter_UpdatePrices => {
            // TODO: validate that price updates came from the offramp
            var st = lazy Storage.load();
            updatePrices(mutate st, msg.updates);
            st.store();
        }
        FeeQuoter_UpdateFeeTokens => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            updateFeeTokens(mutate st, msg);
            st.store();
        }
        FeeQuoter_UpdateTokenTransferFeeConfigs => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            updateTokenTransferFeeConfigs(mutate st, msg);
            st.store();
        }
        FeeQuoter_UpdateDestChainConfigs => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            updateDestChainConfigs(mutate st, msg.updates); // TODO: pass in st.destChainConfigs instead
            st.store();
        }
        FeeQuoter_GetValidatedFee<cell> => { getValidatedFee(msg, in.senderAddress) }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun updateFeeTokens(mutate st: Storage, msg: FeeQuoter_UpdateFeeTokens) {
    var entry = msg.add.findFirst();
    while (entry.isFound) {
        val token = entry.getKey();
        val config = entry.loadValue();
        st.premiumMultiplierWeiPerEth.set(token, config.premiumMultiplierWeiPerEth);
        entry = msg.add.iterateNext(entry);
    }

    var iter = Iterator<address>.new(msg.remove);
    while (!iter.empty()) {
        val tokenAddr = iter.next();
        st.premiumMultiplierWeiPerEth.delete(tokenAddr);
    }
}

fun updateTokenTransferFeeConfigs(mutate st: Storage, msg: FeeQuoter_UpdateTokenTransferFeeConfigs) {
    var entry = msg.updates.findFirst();
    while (entry.isFound) {
        val destChainSelector = entry.getKey();
        val update = entry.loadValue();
        var configEntry = st.destChainConfigs.get(destChainSelector);
        if (configEntry.isFound) {
            var destChainConfig = configEntry.loadValue();

            var tokenEntry = update.add.findFirst();
            while (tokenEntry.isFound) {
                val tokenAddr = tokenEntry.getKey();
                val config = tokenEntry.loadValue();

                destChainConfig.tokenTransferFeeConfigs.set(tokenAddr, config);
                tokenEntry = update.add.iterateNext(tokenEntry);
            }

            var iter = Iterator<address>.new(update!.remove);
            while (!iter.empty()) {
                val tokenAddr = iter.next();
                destChainConfig.tokenTransferFeeConfigs.delete(tokenAddr);
            }

            st.destChainConfigs.replaceAndGetPrevious(destChainSelector, destChainConfig);
        }
        entry = msg.updates.iterateNext(entry);
    }
}

// TODO: allow providing an array of these msgs to feeQuoter
fun updateDestChainConfigs(mutate st: Storage, updates: cell) {
    var iter = Iterator<FeeQuoter_UpdateDestChainConfig>.new(updates);

    while (!iter.empty()) {
        val update = iter.next();
        // create or update entries
        val entry = st.destChainConfigs.get(update.destChainSelector);
        if (entry.isFound) {
            var destChainConfig = entry.loadValue();
            destChainConfig.config = update.destChainConfig;
            st.destChainConfigs.replaceIfExists(update.destChainSelector, destChainConfig);
        } else {
            st.destChainConfigs.set(update.destChainSelector, DestChainConfig {
                config: update.destChainConfig,
                usdPerUnitGas: GasPrice {
                    executionGasPrice: 0,
                    dataAvailabilityGasPrice: 0,
                    timestamp: 0,
                }.toCell(),
                tokenTransferFeeConfigs: createEmptyMap()
            })
        }
    }
}

fun updatePrices(mutate st: Storage, priceUpdates: PriceUpdates) {
    val timestamp = blockchain.now();

    // TODO: assert cells are well-formed
    var iter = Iterator<TokenPriceUpdate>.new(priceUpdates.tokenPriceUpdates);
    while (!iter.empty()) {
        val update = iter.next();

        st.usdPerToken.set(update.sourceToken, TimestampedPrice {
            value: update.usdPerToken,
            timestamp
        })
      //TODO: emit UsdPerTokenUpdated(update.sourceToken, update.usdPerToken, block.timestamp);
    }

    var iter2 = Iterator<GasPriceUpdate>.new(priceUpdates.gasPriceUpdates);
    while (!iter2.empty()) {
        val update = iter2.next();

        val entry = st.destChainConfigs.get(update.destChainSelector);
        // NOTE: this only allows pushing gas updates to chains with a destChainConfig
        if (entry.isFound) {
            var destChainConfig = entry.loadValue();
            destChainConfig.usdPerUnitGas = GasPrice {
                executionGasPrice: update.executionGasPrice,
                dataAvailabilityGasPrice: update.dataAvailabilityGasPrice,
                timestamp
            }.toCell();
            st.destChainConfigs.replaceAndGetPrevious(update.destChainSelector, destChainConfig);

          //TODO: emit UsdPerUnitGasUpdated(update.destChainSelector, update.usdPerUnitGas, block.timestamp);
        }
    }
}

// apply_premium_multiplier_wei_per_eth_updates??

fun DestChainConfig.getValidatedGasPrice(self): (uint112, uint112) {
    val price = self.usdPerUnitGas.load();
    val threshold = self.config.gasPriceStalenessThreshold as int64;
    val elapsedTime = blockchain.now() - price.timestamp;

    assert(threshold == 0 || threshold > elapsedTime, ERROR_STALE_GAS_PRICE);

    return (price.executionGasPrice, price.dataAvailabilityGasPrice)
}

get fun validatedFee(msg: CCIPSend): coins {
    var st = lazy Storage.load();

    val destChainConfig = st.destChainConfigs.mustGet(msg.destChainSelector, ERROR_DEST_CHAIN_NOT_ENABLED);
    assert(destChainConfig.config.isEnabled, ERROR_DEST_CHAIN_NOT_ENABLED);
    // validate the fee token is actually supported
    val premiumMultiplier = st.premiumMultiplierWeiPerEth.mustGet(msg.feeToken, ERROR_FEE_TOKEN_NOT_SUPPORTED) as uint256;
    val feeTokenPrice = st.usdPerToken.mustGet(msg.feeToken, ERROR_FEE_TOKEN_NOT_SUPPORTED);

    var gasLimit = 0;
    // NOTE: we could deploy distinct contracts to cut down on code
    // match (cfg.chainFamilySelector) {
    //     CHAIN_FAMILY_SELECTOR_EVM | CHAIN_FAMILY_SELECTOR_APTOS | CHAIN_FAMILY_SELECTOR_SUI => { } // resolveGenericGasLimit()
    //     CHAIN_FAMILY_SELECTOR_SVM => { } // resolveSVMGasLimit()
    // }
    // validateDestFamilyAddress(cfg.chainFamilySelector, receiver, gasLimit);

    // TODO: this can throw and bounce the message
    val (executionGasPrice, dataAvailabilityGasPrice) = destChainConfig.getValidatedGasPrice();

    // Network fee

    var tokensIter = Iterator<TokenAmount>.new(msg.tokenAmounts);
    var (tokenCount, premiumFeeUsdWei, tokenTransferGas, tokenTransferBytesOverhead) = (0, destChainConfig.config.networkFeeUsdCents as uint256, 0, 0);
    if (!tokensIter.empty()) {
        (tokenCount, premiumFeeUsdWei, tokenTransferGas, tokenTransferBytesOverhead) = getTokenTransferCost(st, destChainConfig, mutate tokensIter);
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
    var calldataGas = calldataLen * destChainConfig.config.destGasPerPayloadByteBase as uint256;
    val calldataThreshold = destChainConfig.config.destGasPerPayloadByteThreshold as uint256;
    if (calldataLen > calldataThreshold) {
        val baseCalldataGas = destChainConfig.config.destGasPerPayloadByteBase as uint256 * calldataThreshold;
        val extraBytes = calldataLen - calldataThreshold;
        val extraCalldataGas = extraBytes * destChainConfig.config.destGasPerPayloadByteHigh as uint256;
        calldataGas = baseCalldataGas + extraCalldataGas;
    }
    val executionGas = gasLimit + destChainConfig.config.destGasOverhead as uint256 + calldataGas + tokenTransferGas;

    val executionCost = executionGasPrice
        * executionGas
        * destChainConfig.config.gasMultiplierWeiPerEth as uint256;

    // Data availability cost

    // Sums up byte lengths of fixed message fields and dynamic message fields.
    // Fixed message fields do account for the offset and length slot of the dynamic fields.
    val dataAvailabilityLengthBytes = TON_2_EVM_MESSAGE_FIXED_BYTES
        + calldataLen
        + tokenCount as uint256 * TON_2_EVM_MESSAGE_FIXED_BYTES_PER_TOKEN
        + tokenTransferBytesOverhead;

    // dest_data_availability_overhead_gas is a separate config value for flexibility to be updated
    // independently of message codestChainConfig. Its value is determined by CCIP lane implementation, e.g.
    // the overhead data posted for OCR.
    val dataAvailabilityGas = dataAvailabilityLengthBytes
        * destChainConfig.config.destGasPerDataAvailabilityByte as uint256
        + destChainConfig.config.destDataAvailabilityOverheadGas as uint256;

    // data_availability_gas_price is in 18 decimals, dest_data_availability_multiplier_bps is in 4 decimals
    // We pad 14 decimals to bring the result to 36 decimals, in line with token bps and execution fee.
    val dataAvailabilityCost = dataAvailabilityGasPrice
        * dataAvailabilityGas
        * destChainConfig.config.destDataAvailabilityMultiplierBps as uint256
        * VAL_1E14;

    // At this step, every fee component has been raised to 36 decimals
    val feeTokenValue =
        (premiumFeeUsdWei * premiumMultiplier) + executionCost + dataAvailabilityCost;

    // Fee token value is in 36 decimals
    // Fee token price is in 18 decimals USD for 1e18 smallest token denominations.
    // The result is the fee in the fee tokens smallest denominations (e.g. lamport for Sol).
    val feeTokenAmount = (feeTokenValue / feeTokenPrice.value);

    return feeTokenAmount;
}

fun getValidatedFee(payload: FeeQuoter_GetValidatedFee<cell>, sender: address) {
    val msg = payload.msg.load();
    val feeTokenAmount = validatedFee(msg);

    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO:
        dest: sender,
        body: FeeQuoter_MessageValidated<cell> {
            msg: payload.msg,
            metadata: payload.metadata,
            fee: feeTokenAmount,
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);
}

// TODO: a lot of the as uint256 annotations seem to be unnecessary in this function
fun getTokenTransferCost(st: Storage, destChainConfig: DestChainConfig, mutate tokens: Iterator<TokenAmount>): (int, uint256, uint32, uint32) {
    var tokenTransferFeeWei: uint256 = 0;
    var tokenTransferGas: uint32 = 0;
    var tokenTransferBytesOverhead: uint32 = 0;

    var count = 0;

    while (!tokens.empty()) {
        val tokenAmount = tokens.next();
        count += 1;

        val transferFeeConfig = destChainConfig.tokenTransferFeeConfigs.mustGet(tokenAmount.token, ERROR_TOKEN_NOT_SUPPORTED);
        if (!transferFeeConfig.isEnabled) {
            // If the token has no specific overrides configured, we use the global defaults.
            tokenTransferFeeWei +=((destChainConfig.config.defaultTokenFeeUsdCents as uint256) * VAL_1E16);
            tokenTransferGas += destChainConfig.config.defaultTokenDestGasOverhead;
            tokenTransferBytesOverhead += CCIP_LOCK_OR_BURN_V1_RET_BYTES;
        } else {
            var bpsFeeUsdWei = 0;
            if (transferFeeConfig.deciBps > 0) {
                val tokenPrice = st.usdPerToken.mustGet(tokenAmount.token, ERROR_TOKEN_NOT_SUPPORTED);

                // Calculate token transfer value, then apply fee ratio
                // ratio represents multiples of 0.1bps, or 1e-5
                val tokenUsdValue = tokenAmount.amount as uint256 * tokenPrice.value / VAL_1E18;
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

get fun tokenPrice(token: address): TimestampedPrice {
    val st = lazy Storage.load();
    return st.usdPerToken.mustGet(token, ERROR_TOKEN_NOT_SUPPORTED);
}

// vec<TimestampedPrice>
get fun tokenPrices(tokens: tuple): tuple {
    val st = lazy Storage.load();
    var list: tuple = createEmptyTuple();
    var iter = TupleIterator<address>.new(tokens);

    while(!iter.empty()) {
        val token = iter.next();
        // NOTE: Need to skip missing items as nil entries rather than fail the query
        val entry = st.usdPerToken.get(token);
        list.push(entry.loadValue().toCell());
    }
    return list;
}

get fun destinationChainGasPrice(destChainSelector: uint64): cell {
    val st = lazy Storage.load();
    val config = st.destChainConfigs.mustGet(destChainSelector, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    return config.usdPerUnitGas
}

get fun tokenAndGasPrices(token: address, destChainSelector: uint64) {
    
}

// vec<address>
get fun feeTokens(): tuple {
    val st = lazy Storage.load();
    var feeTokens = st.premiumMultiplierWeiPerEth;
    
    var list: tuple? = null;
    var entry = feeTokens.findFirst();
    while (entry.isFound) {
        val address = entry.getKey();
        list = listPrepend(address, list);

        entry = feeTokens.iterateNext(entry);
    }
    return list!;
}

get fun tokenTransferFeeConfig() {}

// TODO: processMessageArgs(), processPoolReturnData()?

get fun destChainConfig(destChainSelector: uint64): DestChainConfig {
    val st = lazy Storage.load();
    return st.destChainConfigs.mustGet(destChainSelector, ERROR_DEST_CHAIN_NOT_ENABLED);
}

get fun staticConfig(): (uint96, address, uint64) {
    val st = lazy Storage.load();
    return (st.maxFeeJuelsPerMsg, st.linkToken, st.tokenPriceStalenessThreshold);
}

get fun typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.FeeQuoter", "1.0.0");
}

get fun destChainSelectors(): tuple {
    val st = lazy Storage.load();
    var d = st.destChainConfigs;
    return keysLispList(d)!;
}
