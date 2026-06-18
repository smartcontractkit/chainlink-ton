// SPDX-License-Identifier: BUSL-1.1
import "errors"
import "events"
import "messages"
import "types"
import "storage"

import "../common/types";
import "../common/cross_chain_address_validation"
import "../../lib/access/ownable_2step";
import "../../lib/funding/withdrawable"
import "../../lib/versioning/upgradeable"
import "../../lib/utils";
import "../../lib/math";
import "../router/messages"

tolk 1.4.1

contract FeeQuoter {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.3"
    description: "link.chain.ton.ccip.FeeQuoter"

    storage: Storage
    incomingMessages: FeeQuoter_InMessage
}

const CONTRACT_VERSION = "1.6.3".literalSlice();
const RESERVE = ton("1");

fun requireSupportedVersion(version: slice) {
    assert (version.bitsEqual("1.6.2".literalSlice())) throw Upgradeable_Error.VersionMismatch;
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy FeeQuoter_InMessage.fromSlice(in.body);
    match (msg) {
        FeeQuoter_AddPriceUpdater => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.allowedPriceUpdaters.addIfNotExists(msg.priceUpdater, ());
            st.store();
        },
        FeeQuoter_RemovePriceUpdater => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.allowedPriceUpdaters.delete(msg.priceUpdater);
            st.store();
        },
        FeeQuoter_UpdatePrices => {
            var st = lazy Storage.load();

            // either an allowed price updater or feeQuoter owner
            assert(st.allowedPriceUpdaters.exists(in.senderAddress) || st.ownable.owner == in.senderAddress, FeeQuoter_Error.UnauthorizedPriceUpdater);
            updatePrices(mutate st, msg.updates);
            st.store();

            sendExcessesTo(msg.sendExcessesTo, in.senderAddress);
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
            updateDestChainConfigs(mutate st, msg.updates);
            st.store();
        }
        FeeQuoter_GetValidatedFee<RemainingBitsAndRefs> => {
            assert (in.valueCoins >= FeeQuoter_Costs.GetValidatedFee()) throw FeeQuoter_Error.InsufficientFee;
            handleGetValidatedFee(msg, in.senderAddress)
        }
        Withdrawable_Withdraw => {
            val st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{
                reserve: RESERVE
            }.withdraw(msg);
        }
        Upgradeable_Upgrade => {
            val st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Upgradeable{ migrate, version }.upgrade(msg);
        }
        else => {
            // attempt to handle Ownable messages
            var st = lazy Storage.load();
            val handled = st.ownable.onInternalMessage(in.senderAddress, in.body);
            if (handled) {
                st.store();
                return;
            }

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

            st.destChainConfigs.replaceIfExists(destChainSelector, destChainConfig);
        }
        entry = msg.updates.iterateNext(entry);
    }
}

fun updateDestChainConfigs(mutate st: Storage, updates: SnakedCell<FeeQuoter_UpdateDestChainConfig>) {
    var iter = updates.iter();

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
                tokenTransferFeeConfigs: []
            })
        }
    }
}

fun updatePrices(mutate st: Storage, priceUpdates: PriceUpdates) {
    val timestamp = blockchain.now();

    var iter = priceUpdates.tokenPriceUpdates.iter();
    while (!iter.empty()) {
        val update = iter.next();

        st.usdPerToken.set(update.sourceToken, TimestampedPrice {
            value: update.usdPerToken,
            timestamp
        });

        emit(USD_PER_TOKEN_UPDATED_TOPIC, UsdPerTokenUpdated {
            sourceToken: update.sourceToken,
            usdPerToken: update.usdPerToken,
            timestamp,
        })
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
            st.destChainConfigs.replaceIfExists(update.destChainSelector, destChainConfig);

            emit(USD_PER_UNIT_GAS_UPDATED, UsdPerUnitGasUpdated {
                destChainSelector: update.destChainSelector,
                executionGasPrice: update.executionGasPrice,
                dataAvailabilityGasPrice: update.dataAvailabilityGasPrice,
                timestamp,
            })
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

// Note: Equivalent to validatedFee for cell encoding instead of using stack
get fun validatedFeeCell(msg: Cell<Router_CCIPSend>): coins {
    return validatedFee(msg.load());
}

get fun validatedFee(msg: Router_CCIPSend): coins {
    return calculateValidatedFee(msg).feeTokenAmount;
}

fun calculateValidatedFee(msg: Router_CCIPSend): Fee {
    var st = lazy Storage.load();

    val destChainConfigResult = st.destChainConfigs.get(msg.destChainSelector);
    assert (destChainConfigResult.isFound) throw FeeQuoter_Error.DestChainNotEnabled;
    var destChainConfig = destChainConfigResult.loadValue();

    assert(destChainConfig.config.isEnabled, FeeQuoter_Error.DestChainNotEnabled);
    assert(msg.feeToken != null, FeeQuoter_Error.FeeTokenNotSupported);
    val feeToken = msg.feeToken!;
    val premiumMultiplier = st.premiumMultiplierWeiPerEth.mustGet(feeToken, FeeQuoter_Error.FeeTokenNotSupported);
    val feeTokenPrice = st.usdPerToken.mustGet(feeToken, FeeQuoter_Error.FeeTokenNotSupported);

    val it = (msg.data as SnakedCell<uint8>).iter();
    val (msgDataLen, errorCode) = it.countBytesSafe();
    match (errorCode) {
        0 => { /* continue */ }
        8 => {
            throw FeeQuoter_Error.MsgDataTooLarge;
        }
        Utils_Error.InvalidData as int => {
            throw FeeQuoter_Error.InvalidMsgData;
        }
        else => {
            throw errorCode;
        }
    }

    val gasLimit = validateMessageAndResolveGasLimitForDestination(msg.extraArgs, destChainConfig.config, msg, msgDataLen);

    val (executionGasPrice: uint112, dataAvailabilityGasPrice: uint112) = destChainConfig.getValidatedGasPrice();

    val premiumFeeUsdWei = mustProd(destChainConfig.config.networkFeeUsdCents, VAL_1E16, FeeQuoter_Error.PremiumFeeOverflow);
    // TODO: token transfers are currently priced as if the message carried no tokens
    // (the extra token-transfer fee is ignored). The blocking empty-tokens assert was removed
    // to enable the token-transfer send flow.

    val dataAvailabilityCost = _dataAvailabilityCost(
        destChainConfig,
        dataAvailabilityGasPrice,
        msgDataLen,
        0,
        0,
    );

    val calldataLen = msgDataLen; // + token transfer overheads, not supported in TON yet
    var calldataGas = mustProd(calldataLen, destChainConfig.config.destGasPerPayloadByteBase, FeeQuoter_Error.ExecutionCostOverflow);
    val calldataThreshold = destChainConfig.config.destGasPerPayloadByteThreshold;
    if (calldataLen > calldataThreshold) {
        val baseCalldataGas = mustProd(destChainConfig.config.destGasPerPayloadByteBase, calldataThreshold, FeeQuoter_Error.ExecutionCostOverflow);
        val extraBytes = calldataLen - calldataThreshold;
        val extraCalldataGas = mustProd(extraBytes, destChainConfig.config.destGasPerPayloadByteHigh, FeeQuoter_Error.ExecutionCostOverflow);
        calldataGas = mustAdd(baseCalldataGas, extraCalldataGas, FeeQuoter_Error.ExecutionCostOverflow);
    }

    val executionGas = mustAdd(mustAdd(gasLimit, destChainConfig.config.destGasOverhead, FeeQuoter_Error.ExecutionCostOverflow), calldataGas, FeeQuoter_Error.ExecutionCostOverflow);

    val executionCost = mustProd(mustProd(executionGasPrice, executionGas, FeeQuoter_Error.ExecutionCostOverflow), destChainConfig.config.gasMultiplierWeiPerEth, FeeQuoter_Error.ExecutionCostOverflow);

    val premiumFee = mustProd(premiumFeeUsdWei, premiumMultiplier, FeeQuoter_Error.PremiumFeeOverflow);
    val feeTokenValue = mustAdd(mustAdd(premiumFee, executionCost, FeeQuoter_Error.FeeCalculationOverflow), dataAvailabilityCost, FeeQuoter_Error.FeeCalculationOverflow);

    // Check for division by zero (zero token prices)
    assert(feeTokenPrice.value > 0, FeeQuoter_Error.TokenPriceTooLow);
    val feeTokenAmount = (feeTokenValue / feeTokenPrice.value);

    // Equivalent to processMessageArgs in Solidity FeeQuoter
    val feeValueJuels = calculateFeeValueJuels(st, feeToken, feeTokenValue, feeTokenAmount);

    return Fee {
        feeTokenAmount: mustCastToCoin(feeTokenAmount, FeeQuoter_Error.FeeOverflow),
        feeValueJuels: feeValueJuels as uint96, // safe because already checked against maxFeeJuelsPerMsg
    };
}

fun calculateFeeValueJuels(st: Storage, feeToken: address, feeTokenValue: coins, feeTokenAmount: coins): coins {
    var feeValueJuels = feeTokenAmount;
    if (feeToken != st.linkToken) {
        val linkTokenPrice = st.usdPerToken.mustGet(st.linkToken, FeeQuoter_Error.TokenNotSupported);
        // Check for division by zero (zero token prices)
        assert(linkTokenPrice.value > 0, FeeQuoter_Error.TokenPriceTooLow);
        // convert from USD to juels
        feeValueJuels = feeTokenValue / linkTokenPrice.value;
    }

    assert (feeValueJuels <= st.maxFeeJuelsPerMsg) throw FeeQuoter_Error.MessageFeeTooHigh;
    return feeValueJuels;
}

fun _dataAvailabilityCost(
    destChainConfig: DestChainConfig,
    dataAvailabilityGasPrice: uint112,
    msgDataLen: uint256,
    tokenCount: uint256,
    tokenTransferBytesOverhead: uint256,
): uint256 {
    assert (tokenCount == 0) throw FeeQuoter_Error.TokenTransfersNotSupported;
    assert (tokenTransferBytesOverhead == 0) throw FeeQuoter_Error.TokenTransfersNotSupported;
    // Sums up byte lengths of fixed message fields and dynamic message fields.
    // Fixed message fields do account for the offset and length slot of the dynamic fields.
    val dataAvailabilityLengthBytes = TON_2_EVM_MESSAGE_FIXED_BYTES
        + msgDataLen;
        // Token transfers not supported in TON yet
        // + tokenCount as uint256 * TON_2_EVM_MESSAGE_FIXED_BYTES_PER_TOKEN
        // + tokenTransferBytesOverhead

    // dest_data_availability_overhead_gas is a separate config value for flexibility to be updated
    // independently of message codestChainConfig. Its value is determined by CCIP lane implementation, e.g.
    // the overhead data posted for OCR.
    val daLengthCost = mustProd(dataAvailabilityLengthBytes, destChainConfig.config.destGasPerDataAvailabilityByte, FeeQuoter_Error.DataAvailabilityCostOverflow);
    val dataAvailabilityGas = mustAdd(daLengthCost, destChainConfig.config.destDataAvailabilityOverheadGas, FeeQuoter_Error.DataAvailabilityCostOverflow);

    // data_availability_gas_price is in 18 decimals, dest_data_availability_multiplier_bps is in 4 decimals
    // We pad 14 decimals to bring the result to 36 decimals, in line with token bps and execution fee.
    val daPrice = mustProd(dataAvailabilityGasPrice, dataAvailabilityGas, FeeQuoter_Error.DataAvailabilityCostOverflow);
    val daWithMultiplier = mustProd(daPrice, destChainConfig.config.destDataAvailabilityMultiplierBps, FeeQuoter_Error.DataAvailabilityCostOverflow);
    return mustProd(daWithMultiplier, VAL_1E14, FeeQuoter_Error.DataAvailabilityCostOverflow);
}

fun validateMessageAndResolveGasLimitForDestination(extraArgs: cell, config: FeeQuoterDestChainConfig, message: Router_CCIPSend, msgDataLen: uint256): int {
    // Check that payload is formed correctly.
    assert (msgDataLen <= config.maxDataBytes) throw FeeQuoter_Error.MsgDataTooLarge;
    // NOTE: token transfers are allowed; their extra fee is currently ignored (priced as a plain message).

    // NOTE: we could deploy distinct contracts to cut down on code
    if (config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_EVM ||
        config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_APTOS ||
        config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_TVM) {
        val gasLimit = resolveGenericGasLimit(extraArgs, config.defaultTxGasLimit, config.maxPerMsgGasLimit);
        validateDestFamilyAddress(config.chainFamilySelector, message.receiver, gasLimit);
        return gasLimit;
    }
    else if (config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_SUI) {
        val suiExtraArgs = parseSuiExtraArgs(extraArgs, config.maxPerMsgGasLimit);
        val gasLimit = suiExtraArgs.gasLimit;
        validateDestFamilyAddress(config.chainFamilySelector, message.receiver, gasLimit);

        // objectIds are 32 bytes long
        val objectIds = suiExtraArgs.receiverObjectIds.iter();
        val receiverObjectIdsLength = objectIds.size(SUI_ACCOUNT_BYTE_SIZE);
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
            // plus remaining accounts specified in Sui extraArgs. Each receiverObjectId is 32 bytes.
            suiExpandedDataLength += ((receiverObjectIdsLength + SUI_MESSAGING_ACCOUNTS_OVERHEAD) * SUI_ACCOUNT_BYTE_SIZE);
        }
         
        assert (receiverObjectIdsLength <= SUI_EXTRA_ARGS_MAX_RECEIVER_OBJECT_IDS) throw FeeQuoter_Error.TooManySuiExtraArgsReceiverObjectIds;

        assert (suiExpandedDataLength <= config.maxDataBytes) throw FeeQuoter_Error.MsgDataTooLarge;

        return gasLimit;
    }
    else if (config.chainFamilySelector == CHAIN_FAMILY_SELECTOR_SVM) {
        val svmExtraArgs = parseSvmExtraArgs(extraArgs, config.maxPerMsgGasLimit);
        val gasLimit = svmExtraArgs.computeUnits;
        validateDestFamilyAddress(config.chainFamilySelector, message.receiver, gasLimit);

        // accounts are 32 bytes long
        val accounts = svmExtraArgs.accounts.iter();
        val accountsLength = accounts.size(SVM_ACCOUNT_BYTE_SIZE);
        // The max payload size for SVM is heavily dependent on the receiver object ids passed into extra args and the number of
        // tokens. Below, token and account overhead will count towards maxDataBytes.
        var svmExpandedDataLength = msgDataLen;

        if (a32ByteAddress.fromSlice(message.receiver).value == 0) {
            // When message receiver is zero, CCIP receiver is not invoked on SVM.
            // There should not be additional accounts specified for the receiver.
            assert (accountsLength == 0) throw FeeQuoter_Error.InvalidSVMReceiverAddress;
        } else {
            // The messaging accounts needed for CCIP receiver on SVM are:
            // message receiver, offRamp PDA signer,
            // plus remaining accounts specified in SVM extraArgs. Each account is 32 bytes.
            svmExpandedDataLength += ((accountsLength + SVM_MESSAGING_ACCOUNTS_OVERHEAD) * SVM_ACCOUNT_BYTE_SIZE);
        }

        assert (accountsLength <= SVM_EXTRA_ARGS_MAX_ACCOUNTS) throw FeeQuoter_Error.TooManySuiExtraArgsReceiverObjectIds;

        assert (svmExpandedDataLength <= config.maxDataBytes) throw FeeQuoter_Error.MsgDataTooLarge;

        return gasLimit;
    } else {
        throw FeeQuoter_Error.UnsupportedChainFamilySelector;
    }
}

fun resolveGenericGasLimit(extraArgs: cell, defaultTxGasLimit: uint32, maxPerMsgGasLimit: uint32): int {
    val gasLimit = parseGenericExtraArgs(extraArgs, defaultTxGasLimit, maxPerMsgGasLimit).gasLimit;
    if (gasLimit != null) {
        return gasLimit as int
    }
    return 0;
}

fun parseGenericExtraArgs(extraArgs: cell, defaultTxGasLimit: uint32, maxPerMsgGasLimit: uint32): GenericExtraArgsV2 {
    val extra = _parseUnvalidatedEVMExtraArgs(extraArgs, defaultTxGasLimit);
    assert (extra.gasLimit == null || extra.gasLimit <= maxPerMsgGasLimit) throw FeeQuoter_Error.GasLimitTooHigh;
    // Out of order is always enforced because we don't do ordering on non-EVMs
    assert (extra.allowOutOfOrderExecution) throw FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue;
    return extra;
}

fun _parseUnvalidatedEVMExtraArgs(extraArgs: cell, defaultTxGasLimit: uint32): GenericExtraArgsV2 {
    if (extraArgs.beginParse().isEmpty()) {
        return GenericExtraArgsV2 {
            gasLimit: defaultTxGasLimit as uint256,
            allowOutOfOrderExecution: true,
        };
    }
    return GenericExtraArgsV2.fromCell(extraArgs);
}

fun parseSvmExtraArgs(extraArgs: cell, maxPerMsgGasLimit: uint32): SVMExtraArgsV1 {
    val extra = SVMExtraArgsV1.fromCell(extraArgs, {
        throwIfOpcodeDoesNotMatch: FeeQuoter_Error.InvalidExtraArgsData,
    });
    assert (extra.computeUnits <= maxPerMsgGasLimit) throw FeeQuoter_Error.GasLimitTooHigh;
    // Out of order is always enforced because we don't do ordering on non-EVMs
    assert (extra.allowOutOfOrderExecution) throw FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue;
    return extra;
}

fun parseSuiExtraArgs(extraArgs: cell, maxPerMsgGasLimit: uint32): SuiExtraArgsV1 {
    val extra = SuiExtraArgsV1.fromCell(extraArgs, {
        throwIfOpcodeDoesNotMatch: FeeQuoter_Error.InvalidExtraArgsData,
    });
    assert (extra.gasLimit <= maxPerMsgGasLimit) throw FeeQuoter_Error.GasLimitTooHigh;
    // Out of order is always enforced because we don't do ordering on non-EVMs
    assert (extra.allowOutOfOrderExecution) throw FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue;
    return extra;
}

fun validateDestFamilyAddress(chainFamilySelector: uint32, receiver: CrossChainAddress, gasLimit: int) {
    if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_EVM) {
        return receiver.validateEVMAddress(FeeQuoter_Error.InvalidEVMReceiverAddress);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_SVM) {
        // SVM addresses don't have a precompile space at the first X addresses, instead we validate that if the gasLimit
        // is non-zero, the address must not be 0x0.
        return receiver.validate32ByteAddress(gasLimit > 0 ? 1 : 0, FeeQuoter_Error.Invalid32ByteReceiverAddress);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_APTOS) {
        return receiver.validate32ByteAddress(APTOS_PRECOMPILE_SPACE, FeeQuoter_Error.Invalid32ByteReceiverAddress);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_SUI) {
        return receiver.validate32ByteAddress(gasLimit > 0 ? SUI_PRECOMPILE_SPACE : 0, FeeQuoter_Error.Invalid32ByteReceiverAddress);
    } else {
        throw FeeQuoter_Error.UnsupportedChainFamilySelector;
    }
}


fun handleGetValidatedFee(payload: FeeQuoter_GetValidatedFee<RemainingBitsAndRefs>, sender: address) {
    val msg = payload.msg.load();
    var response: OutMessage;
    try {
        val fee = calculateValidatedFee(msg);

        response = createMessage({
            bounce: true,
            value: 0,
            dest: sender,
            body: FeeQuoter_MessageValidated<RemainingBitsAndRefs> {
                fee: {
                    feeTokenAmount: fee.feeTokenAmount,
                    feeValueJuels: fee.feeValueJuels,
                },
                msg: payload.msg,
                context: payload.context,
            }
        });
    } catch (e) {
        response = createMessage({
            bounce: true,
            value: 0,
            dest: sender,
            body: FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs> {
                msg: payload.msg,
                error: e,
                context: payload.context,
            }
        });
    }
    response.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun sendExcessesTo(sendExcessesTo: address?, sender: address) {
    var receiver = sender;
    if (sendExcessesTo != null) {
        receiver = sendExcessesTo!;
    }

    val returnExcesses = createMessage({
        bounce: false,
        value: 0,
        dest: receiver,
        body: createEmptyCell(),
    });
    reserveToncoinsOnBalance(0, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE);
    returnExcesses.send(SEND_MODE_CARRY_ALL_BALANCE);
}

get fun tokenPrice(token: address): TimestampedPrice {
    val st = lazy Storage.load();
    val entry = st.usdPerToken.get(token);
    assert (entry.isFound, FeeQuoter_Error.TokenNotSupported);
    return entry.loadValue();
}

get fun tokenPrices(tokens: array<address>): array<Cell<TimestampedPrice>?> {
    val st = lazy Storage.load();
    var prices: array<Cell<TimestampedPrice>?> = [];
    var tokenIterator = ArrayIterator<address>.new(tokens);

    while(!tokenIterator.empty()) {
        val token = tokenIterator.next();
        val entry = st.usdPerToken.get(token);
        // NOTE: Need to skip missing items as nil entries rather than fail the query
        if (entry.isFound) {
            prices.push(entry.loadValue().toCell());
        } else {
            prices.push(null);
        }
    }
    return prices;
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
    val v = st.premiumMultiplierWeiPerEth.mustGet(token, FeeQuoter_Error.FeeTokenNotSupported);
    return v as uint256;
}

// vec<address>
get fun feeTokens(): lisp_list<address> {
    val st = lazy Storage.load();
    val feeTokens = st.premiumMultiplierWeiPerEth;
    return keysLispList(feeTokens);
}

get fun tokenTransferFeeConfig(
    destChainSelector: uint64,
    token: address,
): TokenTransferFeeConfig {
    val st = lazy Storage.load();
    val destChainConfig = st.destChainConfigs.mustGet(destChainSelector, FeeQuoter_Error.DestChainNotEnabled);
    return destChainConfig.tokenTransferFeeConfigs.mustGet(token, FeeQuoter_Error.FeeTokenNotSupported);
}

get fun destChainConfig(destChainSelector: uint64): DestChainConfig {
    val st = lazy Storage.load();
    return st.destChainConfigs.mustGet(destChainSelector, FeeQuoter_Error.DestChainNotEnabled);
}

get fun staticConfig(): (uint96, address, uint32) {
    val st = lazy Storage.load();
    return (st.maxFeeJuelsPerMsg, st.linkToken, st.tokenPriceStalenessThreshold);
}

get fun dataAvailabilityCost(
    destChainSelector: uint64,
    dataAvailabilityGasPrice: uint112,
    calldataLen: uint256,
    tokenCount: uint256,
    tokenTransferBytesOverhead: uint256,
): uint256 {
    val st = lazy Storage.load();

    val destChainConfig = st.destChainConfigs.mustGet(destChainSelector, FeeQuoter_Error.DestChainNotEnabled);
    return _dataAvailabilityCost(
        destChainConfig,
        dataAvailabilityGasPrice,
        calldataLen,
        tokenCount,
        tokenTransferBytesOverhead,
    );
}

/// Gets the current owner of the contract.
get fun owner(): address {
    val st = lazy Storage.load();
    return st.ownable.get_owner();
}

/// Gets the pending owner of the contract, if any.
get fun pendingOwner(): address? {
    val st = lazy Storage.load();
    return st.ownable.get_pendingOwner();
}

get fun typeAndVersion(): (slice, slice) {
    return (FeeQuoter_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return FeeQuoter_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(FeeQuoter_FACILITY_NAME.crc32(), local);
}

get fun destChainSelectors(): lisp_list<uint64> {
    val st = lazy Storage.load();
    val d = st.destChainConfigs;
    return keysLispList(d)!;
}

get fun reserve(): coins {
    return RESERVE;
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    val NEW_THRESHOLD = 24 * 60 * 60; //  86400 seconds = 24 hours
    requireSupportedVersion(version);
    var st = Storage.fromCell(storage);
    st.tokenPriceStalenessThreshold = NEW_THRESHOLD;
    return st.toCell();
}

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }
