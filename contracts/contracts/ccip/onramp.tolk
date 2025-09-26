import "@stdlib/lisp-lists";
import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "../lib/utils.tolk";
import "@stdlib/tvm-dicts";
import "ccipsend_executor/storage"
import "ccipsend_executor/messages"
import "../lib/jetton/messages"
import "../lib/jetton/messages_extended"

const CCIP_MESSAGE_SENT_TOPIC: int = stringCrc32("CCIPMessageSent"); 

struct CCIPMessageSent {
    message: TVM2AnyRampMessage;
}

struct OnRamp_Storage {
    ownable: Ownable2Step;

    // static config
    chainSelector: uint64; // source chain selector
    // TODO: rmnRemote (only used to validate curse on getFee), nonceManager, tokenAdminRegistry
    // hmm, need to consider the design here.
    // probably like solana tokenAdminRegistry will be fused into onramp/router
    // but the problem is unbounded dict growth
    // it's only used to resolve getPoolBySourceToken when calling lockOrBurn
    // maybe onramp -> feeQuoter -> tokenAdminRegistry(token instance) -> tokenPool.LockAndBurn?
    // NOTE: fee quoter also processes pool return data

    // dynamic config
    config: Cell<OnRampDynamicConfig>;

    destChainConfigs: map<uint64, DestChainConfig>; // chainSelector -> DestChainConfig
    executor_code: cell; // code for CCIPSendExecutor
    currentMessageId: uint224;
    // TODO track last destroyed executor+gaps to allow owner to reclaim funds?
}

struct DestChainConfig {
    router: address; // Local router address that is allowed to send messages to the destination chain.
    sequenceNumber: uint64;
    allowlistEnabled: bool;
    allowedSenders: map<address, bool>;
}
// TODO: move allowlist into accounts
// user calls wallet -> account contract -> router, account verifies dest chain and if
// the user is allowed to send. This will also allow users to deposit funds ahead of time
// unless we intend to keep the allow list small?
// nonceManager: also seems to fit best in a sender subcontract with a dict destChainSelector -> nonce
// if we pass through account contract then we can grab a nonce and pass it through?

fun OnRamp_Storage.load(): OnRamp_Storage {
    return OnRamp_Storage.fromCell(contract.getData());
}

fun OnRamp_Storage.store(self) {
    return contract.setData(self.toCell());
}

type OnRamp_InMessage =
    | OnRampSend
    | OnRamp_WithdrawJettons
    | OnRamp_ExecutorFinishedSuccessfully
    | JettonTransferNotification
    | SetDynamicConfig
    | OnRampUpdateDestChainConfigs
    | UpdateAllowlists
    ;
    // TODO | UpdateExecutorCode

fun onInternalMessage(in: InMessage) {
    val msg = lazy OnRamp_InMessage.fromSlice(in.body);
    match (msg) {
        OnRampSend => {send(msg, in.senderAddress)}
        JettonTransferNotification => { onTransferNotification(msg, in.senderAddress) }
        OnRamp_WithdrawJettons => { handleWithdrawJettons(msg, in.senderAddress)},
        OnRamp_ExecutorFinishedSuccessfully => {
            commit(msg, in.senderAddress);
        }
        SetDynamicConfig => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.config = msg.config.toCell();
            st.store();
        }
        OnRampUpdateDestChainConfigs => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            applyDestChainConfigUpdates(mutate st, msg.updates);
            st.store();
        }
        UpdateAllowlists => {
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

fun send(payload: OnRampSend, sender: address, jettonWallet: address? = null) {
    var st = lazy OnRamp_Storage.load();

    val msg = payload.msg.load();

    // validate allowlist
    val destChainConfig = st.destChainConfigs.mustGet(msg.destChainSelector, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);

    // ccipSend must be forwarded from the router
    assert(destChainConfig.router == sender, ERROR_UNAUTHORIZED);

    if (destChainConfig.allowlistEnabled) {
        val entry = destChainConfig.allowedSenders.get(payload.metadata.sender);
        assert(entry.isFound && entry.loadValue(), ERROR_SENDER_NOT_ALLOWED);
    }

    // TODO: validate jetton amounts match msg.tokenAmounts

    // TODO: validate value transfered is enough to deploy executor

    val config = st.config.load();

    var tokenRegistry: address? = null;
    var tokenAmounts = Iterator<TokenAmount>.new(msg.tokenAmounts);
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

type OnRamp_NotificationInMessage =
    | OnRampSend
    // TODO refunds from CCIPSendExecutor
    ;

fun onTransferNotification(notification: JettonTransferNotification, jettonWallet: address) {
    val msg = lazy OnRamp_NotificationInMessage.fromCell(notification.forwardPayload!);

    match (msg) {
        OnRampSend => {send(msg, notification.sender, jettonWallet)}
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
    var tokenAmounts = Iterator<TokenAmount>.new(payload.tokens);
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
            jettonAmount: tokenAmount.amount,
            transferRecipient: executor,
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

    val ccipsend: CCIPSend = payload.msg.load();
    val metadata = payload.metadata;

    // validate user transferred enough value
    // else refund and notify

    // assign sequence number, we can't do this sooner since the message might fail validation/getFee
    var destChainConfig = st.destChainConfigs.mustGet(ccipsend.destChainSelector, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
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
    val config = st.destChainConfigs.mustGet(destChainSelector,ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    return config.sequenceNumber + 1;
}

// TODO: getFee forwarding? users should just call the fee quoter

get fun staticConfig() {
    // chainSelector, rmnRemote, nonceManager, tokenAdminRegistry
}

get fun dynamicConfig(): OnRampDynamicConfig {
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
            st.destChainConfigs.set(update.destChainSelector, DestChainConfig {
                router: update.router,
                sequenceNumber: 0,
                allowlistEnabled: update.allowlistEnabled,
                allowedSenders: createEmptyMap(),
            })
        }
    }
}

get fun destChainConfig(destChainSelector: uint64): DestChainConfig {
    val st = lazy OnRamp_Storage.load();
    return st.destChainConfigs.mustGet(destChainSelector,ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
}

// vec<address>
get fun allowedSendersList(destChainSelector: uint64): tuple {
    val st = lazy OnRamp_Storage.load();
    val config = st.destChainConfigs.mustGet(destChainSelector,ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    var allowedSenders = config.allowedSenders;

    var list: tuple? = null;
    var entry = allowedSenders.findFirst();
    while (entry.isFound) {
        // var (wc, addressHash) = (key! as address).getWorkchainAndHash();
        // list = listPrepend([wc, addressHash], list);
        var address = entry.getKey();
        list = listPrepend(address, list);

        entry = allowedSenders.iterateNext(entry);
    }

    return list!;
}

fun applyAllowlistUpdates(mutate st: OnRamp_Storage, updates: cell) {
    var iter = Iterator<UpdateAllowlist>.new(updates);

    while (!iter.empty()) {
        val update = iter.next();

        var config = st.destChainConfigs.mustGet(update.destChainSelector, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);

        var iterAdd = Iterator<address>.new(update.add);
        while (!iterAdd.empty()) {
            val sender = iterAdd.next();
            config.allowedSenders.set(sender, true);
        }

        var iterRemove = Iterator<address>.new(update.remove);
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

get fun destChainSelectors(): tuple {
    val st = lazy OnRamp_Storage.load();
    var d = st.destChainConfigs;
    return keysLispList(d)!;
}

fun withdrawFeeTokens() {
    
}

get fun typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.OnRamp", "1.0.0");
 }
