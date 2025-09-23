import "../types"
import "messages"
import "storage"
import "../fee_quoter/messages"
import "../token_registry/messages"
import "../token_registry/storage"

tolk 1.1


fun onInternalMessage(in: InMessage) {
    val msg = lazy CCIPSendExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        CCIPSendExecutor_Execute => {
            var this = init(msg.onrampSend, msg.config.load());
            assert (in.senderAddress == this.addresses.load().onramp) throw 0xFFFF;
            this.onExecute(msg.onrampJettonWallet);
        }
        JettonTransferNotification => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_WaitingForJettons>.load();
            // TODO match refunds from TokenPool
            this.onJettonTransferFromOnRamp(msg, in.senderAddress);
        }
        TokenRegistry_TokenPoolInfo => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingTokenRegistryQuery>.load();
            assert (in.senderAddress == this.state.load().tokenRegistry) throw 0xFFFF; // TODO propper error
            this.onTokenPoolInfo(msg);
        }
        FeeQuoter_MessageValidated<Metadata> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            this.onMessageValidated(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        },   
    }
}

fun init(onramp_send: OnRampSend, config: CCIPSendExecutor_Config): CCIPSendExecutor<CCIPSendExecutor_State_Initialized> {
    debug.printString("initializing ccip send executor");
    debug.printString("token registry:");
    debug.print(config.tokenRegistry);
    val st = lazy CCIPSendExecutor_InitialData.fromCell(contract.getData());
    val this = CCIPSendExecutor<CCIPSendExecutor_State_Initialized> {
        messageId: st.messageId,
        onrampSend: onramp_send,
        addresses: CCIPSendExecutor_Addresses {
            onramp: st.onramp,
            feeQuoter: config.feeQuoter,
        }.toCell(),
        state: CCIPSendExecutor_State_Initialized{
            tokenRegistry: config.tokenRegistry,
        }.toCell(),
    };
    debug.printString("stored token registry");
    debug.print(this.state.load().tokenRegistry!);
    return this;
}

fun CCIPSendExecutor<CCIPSendExecutor_State_Initialized>.onExecute(mutate self, onrampJettonWallet: address?) {
    if (onrampJettonWallet != null) {
        self.withdrawJettons(onrampJettonWallet);
    } else {
        getValidatedFee(self.addresses.load().feeQuoter, self.onrampSend);
        val newState = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation> {
            messageId: self.messageId,
            onrampSend: self.onrampSend,
            addresses: self.addresses,
            state: CCIPSendExecutor_State_OnGoingFeeValidation {
                pendingJettonLock: null,
            }.toCell(),
        };
        newState.store();
    }
}

fun CCIPSendExecutor<CCIPSendExecutor_State_Initialized>.withdrawJettons(mutate self, onrampJettonWallet: address) {
    val ccipSend = lazy self.onrampSend.msg.load();
    debug.printString("withdrawing jettons from");
    debug.printString("token registry");
    val state = lazy self.state.load();
    debug.print(state.tokenRegistry!);


    val withdrawMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO
        dest: self.addresses.load().onramp,
        body: OnRamp_WithdrawJettons {
            msgId: self.messageId,
            tokens: ccipSend.tokenAmounts,
            onrampJettonWallet: onrampJettonWallet,
        }
    });
    withdrawMsg.send(SEND_MODE_REGULAR);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_WaitingForJettons> {
        messageId: self.messageId,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_WaitingForJettons {
            tokenRegistry: state.tokenRegistry!,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_WaitingForJettons>.onJettonTransferFromOnRamp(mutate self, msg: JettonTransferNotification, jettonWallet: address) {
    val tokenRegistry = self.state.load().tokenRegistry;
    debug.printString("querying token registry:");
    debug.print(tokenRegistry);
    val queryMsg = createMessage({
        bounce: true,
        value: 0,
        dest: tokenRegistry,
        body: TokenRegistry_GetTokenInfo {
            queryId: 0, // TODO: what id to use?
            ccipSend: self.onrampSend.msg,
            executorJettonWallet: jettonWallet,
        }
    });
    queryMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingTokenRegistryQuery> {
        messageId: self.messageId,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_OnGoingTokenRegistryQuery {
            tokenRegistry,
            jettonWallet: jettonWallet,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingTokenRegistryQuery>.onTokenPoolInfo(mutate self, tokenPoolInfo: TokenRegistry_TokenPoolInfo) {
    val addresses = lazy self.addresses.load();
    getValidatedFee(addresses.feeQuoter, self.onrampSend);

    val state = self.state.load();
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation> {
        messageId: self.messageId,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_OnGoingFeeValidation {
            pendingJettonLock: CCIPSendExecutor_PendingJettonLock {
                tokenRegistry: state.tokenRegistry,
                jettonWallet: state.jettonWallet,
                tokenPool: tokenPoolInfo.tokenPool,
            },
        }.toCell(),
    };
    newState.store();
}

fun getValidatedFee(feeQuoter: address, onrampSend: OnRampSend) {
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO
        dest: feeQuoter,
        body: FeeQuoter_GetValidatedFee<Metadata> {
            msg: onrampSend.msg,
            metadata: onrampSend.metadata.toCell(), // TODO: must include nonce
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidated(mutate self, msg: FeeQuoter_MessageValidated<Metadata>, sender: address) {
    // notification must come from fee quoter
    val addresses = lazy self.addresses.load();
    assert(addresses.feeQuoter == sender, ERROR_UNAUTHORIZED);

    if (msg.fee > contract.getOriginalBalance()) {
        // TODO: handle insufficient funds
    }

    if (self.state.load().pendingJettonLock == null) {
        // no tokens to send, we are done
        self.exitSuccessfully(msg.fee);
        return;
    }
    
    // TODO lock tokens in token pool
    self.exitSuccessfully(msg.fee);
}

fun CCIPSendExecutor<T>.exitSuccessfully(self, fee: coins) {
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorFinishedSuccessfully {
            msgId: self.messageId,
            msg: self.onrampSend.msg,
            metadata: self.onrampSend.metadata,
            fee,
        }
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE /* TODO add this flag after tracetraker is fixed + SEND_MODE_DESTROY */);
}