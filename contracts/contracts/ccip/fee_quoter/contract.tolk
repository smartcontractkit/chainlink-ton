import "errors"
import "messages"
import "types"
import "storage"

import "../common/types";
import "../common/cross_chain_address_validation"
import "../../lib/access/ownable_2step";
import "../../deployable/types";
import "../../lib/utils";
import "../router/messages"
import "../ccipsend_executor/messages"
import "../../lib/funding/withdrawable"
import "../../lib/versioning/upgradeable"

const CONTRACT_VERSION = "0.0.8";
const FACILITY_NAME = "com.chainlink.ton.ccip.FeeQuoter";
const RESERVE = ton("1"); // TODO: set correct value

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
        FeeQuoter_GetValidatedFee<cell> => {
            assert (in.valueCoins >= FeeQuoter_Costs.GetValidatedFee()) throw FeeQuoter_Error.InsufficientFee;
            handleGetValidatedFee(msg, in.senderAddress)
        }
        Withdrawable_Withdraw => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{
                reserve: RESERVE
            }.withdraw(msg, in.valueCoins);
        }
        Upgradeable_Upgrade => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Upgradeable{
                migrate: migrate,
                version: version,
            }.upgrade(msg);
        }
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

    var iter = msg.remove.iter();
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

            var iter = update!.remove.iter();
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
    var iter = priceUpdates.tokenPriceUpdates.iter();
    while (!iter.empty()) {
        val update = iter.next();

        st.usdPerToken.set(update.sourceToken, TimestampedPrice {
            value: update.usdPerToken,
            timestamp
        })
      //TODO: emit UsdPerTokenUpdated(update.sourceToken, update.usdPerToken, block.timestamp);
    }

    var iter2 = priceUpdates.gasPriceUpdates.iter();
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

    assert(threshold == 0 || threshold > elapsedTime, FeeQuoter_Error.StaleGasPrice);

    return (price.executionGasPrice, price.dataAvailabilityGasPrice)
}

get fun validatedFeeCell(msg: Cell<Router_CCIPSend>): coins {
    return validatedFee(msg.load());
}


get fun validatedFee(msg: Router_CCIPSend): coins {
    var st = lazy Storage.load();

    val destChainConfig = st.destChainConfigs.mustGet(msg.destChainSelector, FeeQuoter_Error.DestChainNotEnabled as int);
    assert(destChainConfig.config.isEnabled, FeeQuoter_Error.DestChainNotEnabled);

    val premiumMultiplier = st.premiumMultiplierWeiPerEth.mustGet(msg.feeToken, FeeQuoter_Error.FeeTokenNotSupported as int);
    val feeTokenPrice = st.usdPerToken.mustGet(msg.feeToken, FeeQuoter_Error.FeeTokenNotSupported as int);

    val it = (msg.data as SnakedCell<uint8>).iter();
    val (msgDataLen, errorCode) = it.countBytesSafe();
    if (errorCode == ERROR_INVALID_DATA) {
        throw FeeQuoter_Error.InvalidMsgData;
    } else if (errorCode == 8) {
        throw FeeQuoter_Error.MsgDataTooLarge;
    }

    var gasLimit = validateMessageAndResolveGasLimitForDestination(msg.extraArgs, destChainConfig.config, msg, msgDataLen);

    val (executionGasPrice, dataAvailabilityGasPrice) = destChainConfig.getValidatedGasPrice();

    var tokensIter = msg.tokenAmounts.iter();
    var (tokenCount, premiumFeeUsdWei, tokenTransferGas, tokenTransferBytesOverhead) = (0, destChainConfig.config.networkFeeUsdCents * VAL_1E16, 0, 0);
    if (!tokensIter.empty()) {
        (tokenCount, premiumFeeUsdWei, tokenTransferGas, tokenTransferBytesOverhead) = getTokenTransferCost(st, destChainConfig, mutate tokensIter);
    }

    val dataAvailabilityCost = _dataAvailabilityCost(
        destChainConfig,
        dataAvailabilityGasPrice,
        msgDataLen,
        tokenCount,
        tokenTransferBytesOverhead,
    );

    val calldataLen = msgDataLen + tokenTransferBytesOverhead;
    var calldataGas = calldataLen * destChainConfig.config.destGasPerPayloadByteBase;
    val calldataThreshold = destChainConfig.config.destGasPerPayloadByteThreshold;
    if (calldataLen > calldataThreshold) {
        val baseCalldataGas = destChainConfig.config.destGasPerPayloadByteBase * calldataThreshold;
        val extraBytes = calldataLen - calldataThreshold;
        val extraCalldataGas = extraBytes * destChainConfig.config.destGasPerPayloadByteHigh;
        calldataGas = baseCalldataGas + extraCalldataGas;
    }

    val executionGas = gasLimit + destChainConfig.config.destGasOverhead + calldataGas + tokenTransferGas;

    val executionCost = executionGasPrice
        * executionGas
        * destChainConfig.config.gasMultiplierWeiPerEth;

    val feeTokenValue =
        (premiumFeeUsdWei * premiumMultiplier) + executionCost + dataAvailabilityCost;

    val feeTokenAmount = (feeTokenValue / feeTokenPrice.value);

    return feeTokenAmount;
}

fun _dataAvailabilityCost(
    destChainConfig: DestChainConfig,
    dataAvailabilityGasPrice: uint112,
    msgDataLen: uint256,
    tokenCount: uint256,
    tokenTransferBytesOverhead: uint256,
): uint256 {
     // Sums up byte lengths of fixed message fields and dynamic message fields.
    // Fixed message fields do account for the offset and length slot of the dynamic fields.
    val dataAvailabilityLengthBytes = TON_2_EVM_MESSAGE_FIXED_BYTES
        + msgDataLen
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
    return dataAvailabilityGasPrice
        * dataAvailabilityGas
        * destChainConfig.config.destDataAvailabilityMultiplierBps as uint256
        * VAL_1E14;
}

fun validateMessageAndResolveGasLimitForDestination(extraArgs: cell, config: FeeQuoterDestChainConfig, message: Router_CCIPSend, msgDataLen: uint256): int {
    // Check that payload is formed correctly.
    assert (msgDataLen <= config.maxDataBytes) throw FeeQuoter_Error.MsgDataTooLarge;
    var tokenAmounts = message.tokenAmounts.iter();
    var numberOfTokens = 0;
    while (!tokenAmounts.empty()) {
        var _ = tokenAmounts.next();
        numberOfTokens += 1;
    }
    assert (numberOfTokens <= config.maxNumberOfTokensPerMsg) throw FeeQuoter_Error.UnsupportedNumberOfTokens;

    // NOTE: we could deploy distinct contracts to cut down on code
    if (config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_EVM ||
        config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_APTOS ||
        config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_SUI) {
        val gasLimitOpt = resolveGenericGasLimit(extraArgs, config.defaultTxGasLimit, config.maxPerMsgGasLimit, config.enforceOutOfOrder);
        val gasLimit = gasLimitOpt != null ? gasLimitOpt : 0;
        validateDestFamilyAddress(config.chainFamilySelector, message.receiver, gasLimit);
        return gasLimit;
    }
    else if (config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_SVM) {
        // resolveSVMGasLimit()
        val svmExtraArgs = parseSvmExtraArgs(extraArgs, config.defaultTxGasLimit, config.enforceOutOfOrder);
        val gasLimit = svmExtraArgs.computeUnits;
        validateDestFamilyAddress(config.chainFamilySelector, message.receiver, gasLimit);

        // objectIds are 32 bytes long
        val accounts = svmExtraArgs.accounts.iter();
        val receiverObjectIdsLength = accounts.size(32);
        // The max payload size for SUI is heavily dependent on the receiver object ids passed into extra args and the number of
        // tokens. Below, token and account overhead will count towards maxDataBytes.
        var suiExpandedDataLength = msgDataLen;

        if (a32ByteAddress.fromSlice(message.receiver).value == 0) {
            // When message receiver is zero, CCIP receiver is not invoked on SUI.
            // There should not be additional accounts specified for the receiver.
            assert (receiverObjectIdsLength == 0) throw FeeQuoter_Error.InvalidSuiReceiverAddress;
        } else {
            // The messaging accounts needed for CCIP receiver on SUI are:
            // message receiver,
            // plus remaining accounts specified in Sui extraArgs. Each account is 32 bytes.
            suiExpandedDataLength += ((receiverObjectIdsLength + SUI_MESSAGING_ACCOUNTS_OVERHEAD) * SUI_ACCOUNT_BYTE_SIZE);
        }
         
        if (numberOfTokens > 0 && svmExtraArgs.tokenReceiver == 0) {
            throw FeeQuoter_Error.InvalidTokenReceiver;
        }

        assert (receiverObjectIdsLength <= SUI_EXTRA_ARGS_MAX_RECEIVER_OBJECT_IDS) throw FeeQuoter_Error.TooManySuiExtraArgsReceiverObjectIds;

        suiExpandedDataLength += (numberOfTokens * SUI_TOKEN_TRANSFER_DATA_OVERHEAD);

        // TBD this is not doable in TON. We cannot aford to have a map of every token to be sent to Solana.
        // The token destBytesOverhead can be very different per token so we have to take it into account as well.
        // for (uint256 i = 0; i < numberOfTokens; ++i) {
        //   uint256 destBytesOverhead =
        //     s_tokenTransferFeeConfig[destChainSelector][message.tokenAmounts[i].token].destBytesOverhead
        //   // Pools get Pool.CCIP_LOCK_OR_BURN_V1_RET_BYTES by default, but if an override is set we use that instead.
        //   if (destBytesOverhead > 0) {
        //     suiExpandedDataLength += destBytesOverhead;
        //   } else {
        //     suiExpandedDataLength += Pool.CCIP_LOCK_OR_BURN_V1_RET_BYTES;
        //   }
        // }
        assert (suiExpandedDataLength <= config.maxDataBytes) throw FeeQuoter_Error.MsgDataTooLarge;

        return gasLimit;
    } else {
        throw FeeQuoter_Error.UnsupportedChainFamilySelector;
    }
}

fun resolveGenericGasLimit(extraArgs: cell, defaultTxGasLimit: uint32, maxPerMsgGasLimit: uint32, enforceOutOfOrder: bool): int?{
    return parseGenericExtraArgs(extraArgs, defaultTxGasLimit, maxPerMsgGasLimit, enforceOutOfOrder).gasLimit;
}

fun parseGenericExtraArgs(extraArgs: cell, defaultTxGasLimit: uint32, maxPerMsgGasLimit: uint32, enforceOutOfOrder: bool): GenericExtraArgsV2 {
    val extra = parseUnvalidatedEVMExtraArgs(extraArgs, defaultTxGasLimit);
    assert (extra.gasLimit == null || extra.gasLimit <= maxPerMsgGasLimit) throw FeeQuoter_Error.GasLimitTooHigh;
    if (enforceOutOfOrder) {
        assert (extra.allowOutOfOrderExecution) throw FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue;
    }
    return extra;
}

fun parseUnvalidatedEVMExtraArgs(extraArgs: cell, defaultTxGasLimit: uint32): GenericExtraArgsV2 {
    if (extraArgs.beginParse().isEmpty()) {
        return GenericExtraArgsV2 {
            gasLimit: defaultTxGasLimit as uint256,
            allowOutOfOrderExecution: false, // TBD: isn't default true in TON?
        };
    }
    return GenericExtraArgsV2.fromCell(extraArgs);
}

fun parseSvmExtraArgs(extraArgs: cell, maxPerMsgGasLimit: uint32, enforceOutOfOrder: bool): SVMExtraArgsV1 {
    val extra = SVMExtraArgsV1.fromCell(extraArgs, {
        throwIfOpcodeDoesNotMatch: FeeQuoter_Error.InvalidExtraArgsData as int,
    });
    assert (extra.computeUnits <= maxPerMsgGasLimit) throw FeeQuoter_Error.GasLimitTooHigh;
    if (enforceOutOfOrder) {
        assert (extra.allowOutOfOrderExecution) throw FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue;
    }
    return extra;
}

fun validateDestFamilyAddress(chainFamilySelector: uint32, receiver: CrossChainAddress, gasLimit: int) {
    if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_EVM) {
        return receiver.validateEVMAddress();
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_SVM) {
        // SVM addresses don't have a precompile space at the first X addresses, instead we validate that if the gasLimit
        // is non-zero, the address must not be 0x0.
        return receiver.validate32ByteAddress(gasLimit > 0 ? 1 : 0);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_APTOS) {
        return receiver.validate32ByteAddress(APTOS_PRECOMPILE_SPACE);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_SUI) {
        return receiver.validate32ByteAddress(gasLimit > 0 ? APTOS_PRECOMPILE_SPACE : 0);
    } else {
        throw FeeQuoter_Error.UnsupportedChainFamilySelector;
    }
}


fun handleGetValidatedFee(payload: FeeQuoter_GetValidatedFee<cell>, sender: address) {
    val msg = payload.msg.load();
    var response: OutMessage;
    try {
        val feeTokenAmount = validatedFee(msg);

        response = createMessage({
            bounce: true,
            value: 0,
            dest: sender,
            body: CCIPSendExecutor_MessageValidated<cell> {
                msg: payload.msg,
                metadata: payload.metadata,
                fee: feeTokenAmount,
            }
        });
    } catch (e) {
        response = createMessage({
            bounce: true,
            value: 0,
            dest: sender,
            body: CCIPSendExecutor_MessageValidationFailed<cell> {
                msg: payload.msg,
                metadata: payload.metadata,
                error: e,
            }
        });
    }
    response.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// TODO: a lot of the as uint256 annotations seem to be unnecessary in this function
fun getTokenTransferCost(
    st: Storage,
    destChainConfig: DestChainConfig,
    mutate tokens: Iterator<TokenAmount>,
): (int, uint256, uint32, uint32) {
    var tokenTransferFeeWei: uint256 = 0;
    var tokenTransferGas: uint32 = 0;
    var tokenTransferBytesOverhead: uint32 = 0;

    var count = 0;

    while (!tokens.empty()) {
        val tokenAmount = tokens.next();
        count += 1;

        val transferFeeConfig = destChainConfig.tokenTransferFeeConfigs.mustGet(tokenAmount.token, FeeQuoter_Error.TokenNotSupported as int);
        if (!transferFeeConfig.isEnabled) {
            // If the token has no specific overrides configured, we use the global defaults.
            tokenTransferFeeWei +=((destChainConfig.config.defaultTokenFeeUsdCents as uint256) * VAL_1E16);
            tokenTransferGas += destChainConfig.config.defaultTokenDestGasOverhead;
            tokenTransferBytesOverhead += CCIP_LOCK_OR_BURN_V1_RET_BYTES;
        } else {
            var bpsFeeUsdWei = 0;
            if (transferFeeConfig.deciBps > 0) {
                val tokenPrice = st.usdPerToken.mustGet(tokenAmount.token, FeeQuoter_Error.TokenNotSupported as int);

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
    val entry = st.usdPerToken.get(token);
    assert (entry.isFound, FeeQuoter_Error.TokenNotSupported);
    return entry.loadValue();
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
    var entry = st.destChainConfigs.get(destChainSelector);
    assert (entry.isFound, FeeQuoter_Error.UnknownDestChainSelector);
    return entry.loadValue().usdPerUnitGas
}

get fun tokenAndGasPrices(token: address, destChainSelector: uint64) {
    
}

get fun premiumMultiplierWeiPerEth(token: address): uint256 {
    val st = lazy Storage.load();
    val v = st.premiumMultiplierWeiPerEth.mustGet(token, FeeQuoter_Error.FeeTokenNotSupported as int);
    return v as uint256;
}

// vec<address>
get fun feeTokens(): tuple? {
    val st = lazy Storage.load();
    var feeTokens = st.premiumMultiplierWeiPerEth;
    return keysLispList(feeTokens);
}

get fun tokenTransferFeeConfig(
    destChainSelector: uint64,
    token: address,
): TokenTransferFeeConfig {
    val st = lazy Storage.load();
    val destChainConfig = st.destChainConfigs.mustGet(destChainSelector, FeeQuoter_Error.DestChainNotEnabled as int);
    return destChainConfig.tokenTransferFeeConfigs.mustGet(token, FeeQuoter_Error.FeeTokenNotSupported as int);
}

// TODO: processMessageArgs(), processPoolReturnData()?

get fun destChainConfig(destChainSelector: uint64): DestChainConfig {
    val st = lazy Storage.load();
    return st.destChainConfigs.mustGet(destChainSelector, FeeQuoter_Error.DestChainNotEnabled as int);
}

get fun staticConfig(): (uint96, address, uint64) {
    val st = lazy Storage.load();
    return (st.maxFeeJuelsPerMsg, st.linkToken, st.tokenPriceStalenessThreshold);
}

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.FeeQuoter", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.FeeQuoter"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.FeeQuoter"), local);
}

get fun destChainSelectors(): tuple? {
    val st = lazy Storage.load();
    var d = st.destChainConfigs;
    return keysLispList(d)!;
}

get fun reserve(): coins {
    return RESERVE;
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }
