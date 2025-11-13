tolk 1.1

import "types"
import "events"
import "storage"
import "errors"
import "messages"

import "@stdlib/lisp-lists";
import "../common/types";
import "../../lib/access/ownable_2step";
import "../../lib/utils";
import "../ccipsend_executor/storage"
import "../ccipsend_executor/types"
import "../ccipsend_executor/messages"
import "../router/messages"
import "../../lib/funding/withdrawable"
import "../../lib/versioning/upgradeable"
import "events"
import "../../deployable/types"
import "../fee_quoter/messages"

const CONTRACT_VERSION = "0.0.9";
const RESERVE = ton("1"); // TODO: set correct value

fun onInternalMessage(in: InMessage) {
    val msg = lazy OnRamp_InMessage.fromSlice(in.body);
    match (msg) {
        OnRamp_GetValidatedFee<RemainingBitsAndRefs> => {
            onGetValidatedFee(msg, in.senderAddress)
        }
        FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext> => {
            onMessageValidated(msg, in.senderAddress)
        }
        FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext> => {
            onMessageValidationFailed(msg, in.senderAddress)
        }
        OnRamp_Send => {send(msg, in.senderAddress)}
        OnRamp_ExecutorFinishedSuccessfully => {
            commit(msg, in.senderAddress);
        }
        OnRamp_ExecutorFinishedWithError => {
            replyWithError(msg, in.senderAddress);
        }
        OnRamp_SetDynamicConfig => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.config = msg.config.toCell();
            st.store();
            emit(
                CONFIG_SET_TOPIC,
                ConfigSet {
                    chainSelector: st.chainSelector,
                    dynamicConfig: msg.config,
                }
            )
        }
        OnRamp_UpdateDestChainConfigs => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            applyDestChainConfigUpdates(mutate st, msg.updates);
            st.store();
        }
        OnRamp_UpdateAllowlists => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            applyAllowlistUpdates(mutate st, msg.updates);
            st.store();
        }
        OnRamp_UpdateSendExecutor => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.executor.executorCode = msg.code;
            st.store();
        }
        Withdrawable_Withdraw => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{
                reserve: RESERVE
            }.withdraw(msg, in.valueCoins);
        }
        Upgradeable_Upgrade => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Upgradeable{
                migrate: migrate,
                version: version,
            }.upgrade(msg);
        }
        else => {
            // attempt to handle Ownable messages
            var st = lazy OnRamp_Storage.load();
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

fun onGetValidatedFee(msg: OnRamp_GetValidatedFee<RemainingBitsAndRefs>, sender: address) {
    val st = lazy OnRamp_Storage.load();
    val config = st.config.load();

    val feeQuoter = config.feeQuoter;

    val getFeeMsg = createMessage({
        bounce: true,
        value: 0,
        dest: feeQuoter,
        body: FeeQuoter_GetValidatedFee<OnRamp_GetValidatedFeeContext> {
            msg: msg.ccipSend,
            context: {
                onrampContext: sender,
                userContext: msg.context
            },
        }
    });

    getFeeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onMessageValidated(msg: FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext>, sender: address) {
    val st = lazy OnRamp_Storage.load();
    val feeQuoterAddress = st.config.load().feeQuoter;

    assert (sender == feeQuoterAddress, Error.Unauthorized);

    val userContext = msg.context.userContext;
    val userAddress = msg.context.onrampContext;

    val confirmation = createMessage({
        bounce: false,
        value: 0,
        dest: userAddress,
        body: OnRamp_MessageValidated<RemainingBitsAndRefs> {
            msg: msg.msg,
            fee: msg.fee,
            context: userContext,
        }
    });

    confirmation.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onMessageValidationFailed(msg: FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext>, sender: address) {
    val st = lazy OnRamp_Storage.load();
    val feeQuoterAddress = st.config.load().feeQuoter;

    assert (sender == feeQuoterAddress, Error.Unauthorized);

    val userContext = msg.context.userContext;
    val userAddress = msg.context.onrampContext;

    val rejection = createMessage({
        bounce: false,
        value: 0,
        dest: userAddress,
        body: OnRamp_MessageValidationFailed<RemainingBitsAndRefs> {
            error: msg.error,
            msg: msg.msg,
            context: userContext,
        }
    });

    rejection.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun send(payload: OnRamp_Send, sender: address) {
    var st = lazy OnRamp_Storage.load();

    val msg = payload.msg.load();

    // validate allowlist
    val destChainConfig = st.destChainConfigs.mustGet(msg.destChainSelector, Error.UnknownDestChainSelector as int);

    // ccipSend must be forwarded from the router
    assert(destChainConfig.router == sender, Error.Unauthorized);

    if (destChainConfig.allowlistEnabled) {
        val entry = destChainConfig.allowedSenders.get(payload.metadata.sender);
        assert(entry.isFound && entry.loadValue(), Error.SenderNotAllowed);
    }

    val config = st.config.load();

    val executeMsg = createMessage({
        bounce: true,
        value: 0,
        dest: st.executor.autoDeployAddress(st.executor.currentID),
        body: Deployable_InitializeAndSend {
            stateInit: {
                code: st.executor.executorCode,
                data:  CCIPSendExecutor_InitialData {
                    onramp: contract.getAddress(),
                    id: st.executor.currentID,
                }.toCell(),
            },
            selfMessage: {
                value: SendExecutor_Costs.Execute(),
                body: CCIPSendExecutor_Execute {
                    onrampSend: payload,
                    config: CCIPSendExecutor_Config {
                        feeQuoter: config.feeQuoter,
                    }.toCell(),
                }.toCell(),
            },
        }
    });

    executeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    st.executor.currentID += 1;

    st.store();
}

fun commit(payload: OnRamp_ExecutorFinishedSuccessfully, sender: address) {
    var st = lazy OnRamp_Storage.load();
    assert(st.executor.autoDeployAddress(payload.executorID).addressMatches(sender)) throw Error.Unauthorized;

    val ccipsend: Router_CCIPSend = payload.msg.load();
    val metadata = payload.metadata;

    // validate user transferred enough value
    // else refund and notify

    // assign sequence number, we can't do this sooner since the message might fail validation/getFee
    var destChainConfig = st.destChainConfigs.mustGet(ccipsend.destChainSelector, Error.UnknownDestChainSelector as int);
    destChainConfig.sequenceNumber = destChainConfig.sequenceNumber + 1;
    st.destChainConfigs.set(ccipsend.destChainSelector, destChainConfig);
    st.store();

    var rampMessage = TVM2AnyRampMessage {
        header: RampMessageHeader {
            messageId: 0, // populated after hashing
            sourceChainSelector: st.chainSelector,
            destChainSelector: ccipsend.destChainSelector,
            sequenceNumber: destChainConfig.sequenceNumber,
            // Only bump nonce for messages that specify allowOutOfOrderExecution == false. Otherwise, we may block ordered
            // message nonces, which is not what we want.
            nonce: 0,
        },
        sender: metadata.sender,
        body: TVM2AnyRampMessageBody {
            receiver: ccipsend.receiver.toCell(),
            data: ccipsend.data,
            extraArgs: ccipsend.extraArgs,
            tokenAmounts: ccipsend.tokenAmounts,
            feeToken: ccipsend.feeToken,
            feeTokenAmount: payload.fee as uint256, // safe because it is 128 bits
        }.toCell(),
        feeValueJuels: 0, // TODO:
    };

    // Metadata hash preimage to ensure global uniqueness, ensuring 2 identical messages sent to 2 different lanes
    // will have a distinct hash.
    val metadataHash = beginCell()
        .storeUint(stringSha256("TVM2AnyMessageHashV1"), 256)
        .storeUint(st.chainSelector, 64)
        .storeUint(ccipsend.destChainSelector, 64)
        .storeAddress(contract.getAddress())
        .endCell()
        .hash();

    rampMessage.header.messageId = rampMessage.generateMessageId(metadataHash);
    
    emit(CCIP_MESSAGE_SENT_TOPIC, CCIPMessageSent { message: rampMessage });

    val confirmation = createMessage({
        bounce: false,
        value: 0,
        dest: destChainConfig.router,
        body: Router_MessageSent {
            queryID: ccipsend.queryID,
            messageId: rampMessage.header.messageId,
            destChainSelector: ccipsend.destChainSelector,
            sender: payload.metadata.sender,
        },
    });
    reserveToncoinsOnBalance(payload.fee, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE);
    confirmation.send(SEND_MODE_CARRY_ALL_BALANCE);
}

fun replyWithError(payload: OnRamp_ExecutorFinishedWithError, sender: address) {
    var st = lazy OnRamp_Storage.load();
    assert(st.executor.autoDeployAddress(payload.executorID).addressMatches(sender)) throw Error.Unauthorized;

    val ccipsend: Router_CCIPSend = payload.msg.load();
    val metadata = payload.metadata;

    val errorMsg = createMessage({
        bounce: false,
        value: 0,
        dest: st.destChainConfigs.mustGet(ccipsend.destChainSelector, Error.UnknownDestChainSelector as int).router,
        body: Router_MessageRejected {
            queryID: ccipsend.queryID,
            destChainSelector: ccipsend.destChainSelector,
            sender: metadata.sender,
            error: payload.error,
        },
    });
    errorMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}


get fun isChainSupported(destChainSelector: uint64): bool {
    val st = lazy OnRamp_Storage.load();
    val entry = st.destChainConfigs.get(destChainSelector);
    return entry.isFound;
}

get fun expectedNextSequenceNumber(destChainSelector: uint64): uint64 {
    val st = lazy OnRamp_Storage.load();
    val config = st.destChainConfigs.mustGet(destChainSelector,Error.UnknownDestChainSelector as int);
    return config.sequenceNumber + 1;
}

get fun staticConfig() {
    // chainSelector, rmnRemote, nonceManager, tokenAdminRegistry
}

get fun dynamicConfig(): OnRamp_DynamicConfig {
    val st = lazy OnRamp_Storage.load();
    return st.config.load()
}

fun applyDestChainConfigUpdates(mutate st: OnRamp_Storage, updates: cell) {
    var iter = Iterator<OnRampUpdateDestChainConfig>.new(updates);

    while (!iter.empty()) {
        val update = iter.next();
        // create or update entries
        var config: OnRamp_DestChainConfig;
        val entry = st.destChainConfigs.get(update.destChainSelector);
        if (entry.isFound) {
            config = entry.loadValue();
            config.router = update.router;
            config.allowlistEnabled = update.allowlistEnabled;
            st.destChainConfigs.replaceAndGetPrevious(update.destChainSelector, config);
        } else {
            config = OnRamp_DestChainConfig {
                router: update.router,
                sequenceNumber: 0,
                allowlistEnabled: update.allowlistEnabled,
                allowedSenders: createEmptyMap(),
            };
            st.destChainConfigs.set(update.destChainSelector, config);
            emit(DEST_CHAIN_SELECTOR_ADDED_TOPIC, DestChainSelectorAdded {
                destChainSelector: update.destChainSelector
            });
        }
        emit(DEST_CHAIN_CONFIG_UPDATED_TOPIC, DestChainConfigUpdated {
            destChainSelector: update.destChainSelector,
            destChainConfig: config,
        });
    }
}

get fun destChainConfig(destChainSelector: uint64): OnRamp_DestChainConfig {
    val st = lazy OnRamp_Storage.load();
    return st.destChainConfigs.mustGet(destChainSelector,Error.UnknownDestChainSelector as int);
}

// We are taking destChainSelector as param to enable future per-destination feeQuoters
get fun feeQuoter(destChainSelector: int): address {
    val st = lazy OnRamp_Storage.load();
    val config = st.config.load();
    return config.feeQuoter;
}

// vec<address>
get fun allowedSendersList(destChainSelector: uint64): tuple? {
    val st = lazy OnRamp_Storage.load();
    val config = st.destChainConfigs.mustGet(destChainSelector,Error.UnknownDestChainSelector as int);
    var allowedSenders = config.allowedSenders;

    // var (wc, addressHash) = (key! as address).getWorkchainAndHash();
    return keysLispList(allowedSenders);
}

fun applyAllowlistUpdates(mutate st: OnRamp_Storage, updates: cell) {
    var iter = Iterator<UpdateAllowlist>.new(updates);

    while (!iter.empty()) {
        val update = iter.next();

        var config = st.destChainConfigs.mustGet(update.destChainSelector, Error.UnknownDestChainSelector as int);

        var iterAdd = update.add.iter();
        while (!iterAdd.empty()) {
            val sender = iterAdd.next();
            config.allowedSenders.set(sender, true);
        }

        var iterRemove = update.remove.iter();
        while (!iterRemove.empty()) {
            val sender = iterRemove.next();
            config.allowedSenders.delete(sender);
        }

        st.destChainConfigs.set(update.destChainSelector, config);
    }
}

get fun destChainSelectors(): tuple? {
    val st = lazy OnRamp_Storage.load();
    var d = st.destChainConfigs;
    return keysLispList(d)!;
}

/// Gets the current owner of the contract.
get fun owner(): address {
    val st = lazy OnRamp_Storage.load();
    return st.ownable.get_owner();
}

/// Gets the pending owner of the contract, if any.
get fun pendingOwner(): address? {
    val st = lazy OnRamp_Storage.load();
    return st.ownable.get_pendingOwner();
}

get fun sendExecutorCode(): cell {
    val st = lazy OnRamp_Storage.load();
    return st.executor.executorCode;
}

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.OnRamp", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.OnRamp"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.OnRamp"), local);
}

get fun reserve(): coins {
    return RESERVE;
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }
