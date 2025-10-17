tolk 1.1

import "types"
import "events"
import "storage"
import "errors"
import "messages"

import "@stdlib/lisp-lists";
import "../common/types";
import "../common/messages";
import "../../lib/access/ownable_2step";
import "../../lib/utils";
import "../ccipsend_executor/storage"
import "../ccipsend_executor/types"
import "../ccipsend_executor/messages"
import "../router/messages"
import "../../lib/jetton/messages"
import "../../lib/jetton/messages_extended"

const CONTRACT_VERSION = "0.0.4";

fun onInternalMessage(in: InMessage) {
    val msg = lazy OnRamp_InMessage.fromSlice(in.body);
    match (msg) {
        OnRamp_Send => {send(msg, in.senderAddress)}
        Common_JettonTransferNotification => { onTransferNotification(msg, in.senderAddress) }
        OnRamp_WithdrawJettons => { handleWithdrawJettons(msg, in.senderAddress)},
        OnRamp_ExecutorFinishedSuccessfully => {
            commit(msg, in.senderAddress);
        }
        OnRamp_SetDynamicConfig => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.config = msg.config.toCell();
            st.store();
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
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun send(payload: OnRamp_Send, sender: address, jettonWallet: address? = null) {
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

    // TODO: validate jetton amounts match msg.tokenAmounts

    // TODO: validate value transfered is enough to deploy executor

    val config = st.config.load();

    var tokenRegistry: address? = null;
    var tokenAmounts = msg.tokenAmounts.iter();
    if (!tokenAmounts.empty()) {
        tokenRegistry = calculateTokenRegistryAddress(st, tokenAmounts.next().token);
    }

    val executeMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO: calculate
        dest: AutoDeployAddress {
            stateInit: ContractState {
                code: st.executor_code,
                data: CCIPSendExecutor_InitialData {
                    onramp: contract.getAddress(),
                    messageId: st.currentMessageId,
                }.toCell(),
            }
            // TODO use toShard so these contracts live in the same shard as the onramp
        },
        body: CCIPSendExecutor_Execute {
            onrampSend: payload,
            config: CCIPSendExecutor_Config {
                feeQuoter: config.feeQuoter,
                tokenRegistry,
            }.toCell(),
            onrampJettonWallet: jettonWallet,
        }
    });

    executeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    st.currentMessageId += 1;

    st.store();
}

fun onTransferNotification(notification: Common_JettonTransferNotification, jettonWallet: address) {
    val msg = lazy OnRamp_NotificationInMessage.fromCell(notification.forwardPayload!);

    match (msg) {
        OnRamp_Send => {send(msg, notification.sender, jettonWallet)}
        // TODO refunds from CCIPSendExecutor
        else => {
            // TBD
        }
    }
}

fun calculateTokenRegistryAddress(st: OnRamp_Storage, token: address): address {
    // TODO: calculate token registry address
    return createAddressNone()
}

fun handleWithdrawJettons(payload: OnRamp_WithdrawJettons, executor: address) {
    var st = lazy OnRamp_Storage.load();
    var tokenAmounts = payload.tokens.iter();
    assert (!tokenAmounts.empty()) throw 5;
    var tokenAmount = tokenAmounts.next();
    assert (tokenAmounts.empty()) throw 0xFFFF; // TODO: only single token withdraw supported for now
    // TODO validate sender is executor msg.msgId
        val sendMsg = createMessage({
        bounce: true,
        value: ton("0.5"), // TODO
        dest: payload.onrampJettonWallet,
        body: AskToTransferFwdPayload {
            queryId: 1, // TODO
            jettonAmount: tokenAmount.amount, transferRecipient: executor,
            sendExcessesTo: contract.getAddress(),
            customPayload: null,
            forwardTonAmount: ton("0.45"), // TODO
            forwardPayload: null,
        },
    });
    sendMsg.send(SEND_MODE_REGULAR);
}

fun commit(payload: OnRamp_ExecutorFinishedSuccessfully, sender: address) {
    var st = lazy OnRamp_Storage.load();
    // TODO validate sender is executor msg.msgId

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
            tokenAmounts: createEmptyCell(), // TODO:
            feeToken: ccipsend.feeToken,
            feeTokenAmount: payload.fee as uint256, // safe because it is 128 bits
        }.toCell(),
        feeValueJuels: 0, // TODO:
    };

    // TODO: support for ordered execution
    // rampMessage.header.nonce = isOutOfOrderExecution
    //   ? 0
    //   : nonceManager.getIncrementedOutboundNonce(destChainSelector, metadata.sender);

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

    // TODO: notify user
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

// TODO: getFee forwarding? users should just call the fee quoter

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
        val entry = st.destChainConfigs.get(update.destChainSelector);
        if (entry.isFound) {
            var config = entry.loadValue();
            config.router = update.router;
            config.allowlistEnabled = update.allowlistEnabled;
            st.destChainConfigs.replaceAndGetPrevious(update.destChainSelector, config);
        } else {
            st.destChainConfigs.set(update.destChainSelector, OnRamp_DestChainConfig {
                router: update.router,
                sequenceNumber: 0,
                allowlistEnabled: update.allowlistEnabled,
                allowedSenders: createEmptyMap(),
            })
        }
    }
}

get fun destChainConfig(destChainSelector: uint64): OnRamp_DestChainConfig {
    val st = lazy OnRamp_Storage.load();
    return st.destChainConfigs.mustGet(destChainSelector,Error.UnknownDestChainSelector as int);
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

// outboundNonce() TODO: nonceManager?
// calculateMetadataHash/calculateMessageHash

get fun supportedTokens() {
    // TODO?
}

get fun destChainSelectors(): tuple? {
    val st = lazy OnRamp_Storage.load();
    var d = st.destChainConfigs;
    return keysLispList(d)!;
}

fun withdrawFeeTokens() {
    
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

// Returns the current code of the contract.
get fun code(): cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun codeHash(): int {
    return contract.getCode().hash();
}
