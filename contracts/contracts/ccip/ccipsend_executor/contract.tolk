import "types"
import "messages"
import "storage"
import "errors"
import "../fee_quoter/messages"
import "../onramp/messages"
import "../onramp/types"
import "../common/messages"
import "../../lib/utils"

const CONTRACT_VERSION = "0.0.4";
const FACILITY_NAME = "com.chainlink.ton.ccip.CCIPSendExecutor";

fun onInternalMessage(in: InMessage) {
    val msg = lazy CCIPSendExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        CCIPSendExecutor_Execute => {
            var this = init(msg.onrampSend, msg.config.load());
            assert (in.senderAddress == this.addresses.load().onramp) throw 0xFFFF;
            this.onExecute(msg.onrampJettonWallet);
        }
        CCIPSendExecutor_MessageValidated<Metadata> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            this.onMessageValidated(msg, in.senderAddress);
        }
        Common_JettonTransferNotification => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_WaitingForJettons>.load();
            // TODO match refunds from TokenPool
            this.onJettonTransferFromOnRamp(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        },   
    }
}

fun init(onrampSend: OnRamp_Send, config: CCIPSendExecutor_Config): CCIPSendExecutor<CCIPSendExecutor_State_Initialized> {
    val st = lazy CCIPSendExecutor_InitialData.fromCell(contract.getData());
    return CCIPSendExecutor<CCIPSendExecutor_State_Initialized> {
        messageId: st.messageId,
        onrampSend: onrampSend,
        addresses: CCIPSendExecutor_Addresses {
            onramp: st.onramp,
            feeQuoter: config.feeQuoter,
        }.toCell(),
        state: CCIPSendExecutor_State_Initialized{
            tokenRegistry: config.tokenRegistry,
        }.toCell(),
    };
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
            tokenRegistry: self.state.load().tokenRegistry!,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_WaitingForJettons>.onJettonTransferFromOnRamp(mutate self, msg: Common_JettonTransferNotification, jettonWallet: address) {
    // TODO query token registry for token pool
    getValidatedFee(self.addresses.load().feeQuoter, self.onrampSend); // temporary
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation> {
        messageId: self.messageId,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_OnGoingFeeValidation { // TODO change to OnGoingTokenRegistryQuery
            pendingJettonLock: CCIPSendExecutor_PendingJettonLock {
                tokenRegistry: self.state.load().tokenRegistry,
                jettonWallet: jettonWallet,
                tokenPool: createAddressNone(), // TODO
            },
        }.toCell(),
    };
    newState.store();
}

fun getValidatedFee(feeQuoter: address, onrampSend: OnRamp_Send) {
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

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidated(mutate self, msg: CCIPSendExecutor_MessageValidated<Metadata>, sender: address) {
    // notification must come from fee quoter
    val addresses = lazy self.addresses.load();
    assert(addresses.feeQuoter == sender, CCIPSendExecutor_Error.Unauthorized);

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

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.CCIPSendExecutor", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.CCIPSendExecutor"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.CCIPSendExecutor"), local);
}

// Returns the current code of the contract.
get fun code(): cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun codeHash(): int {
    return contract.getCode().hash();
}
