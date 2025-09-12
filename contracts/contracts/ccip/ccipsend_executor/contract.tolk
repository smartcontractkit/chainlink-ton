import "../types"
import "messages"
import "storage"
import "../fee_quoter/messages"

tolk 1.0


fun onInternalMessage(in: InMessage) {
    val msg = lazy CCIPSendExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        CCIPSendExecutor_Execute => {
            var this = CCIPSendExecutor.init(msg.onrampSend, msg.config);
            assert (in.senderAddress == this.data.onramp) throw 0xFFFF;
            this.onExecute();
            this.store();
        }
        FeeQuoter_MessageValidated<Metadata> => {
            var this = CCIPSendExecutor.load();
            match (this.data.executionStatus) {
                CCIPSendExecutor_OnGoingFeeValidation => {}
                CCIPSendExecutor_WaitingForJettons => { throw 0xFFFF; } // invalid state
                CCIPSendExecutor_OnGoingTokenRegistryQuery => { throw 0xFFFF; } // invalid state
            }
            this.onMessageValidated(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        },   
    }
}

struct CCIPSendExecutor {
    data: CCIPSendExecutor_Data,
}

fun CCIPSendExecutor.init(onramp_send: OnRampSend, config: CCIPSendExecutor_Config): CCIPSendExecutor {
    val st = lazy CCIPSendExecutor_InitialData.fromCell(contract.getData());
    return CCIPSendExecutor {
        data: CCIPSendExecutor_Data{
            onramp: st.onramp,
            messageId: st.messageId,
            onrampSend: onramp_send,
            executionStatus: CCIPSendExecutor_WaitingForJettons {},
            config: config.toCell(),
        },
    };
}

fun CCIPSendExecutor.load(): CCIPSendExecutor {
    val st = lazy CCIPSendExecutor_Data.fromCell(contract.getData());
    return CCIPSendExecutor {
        data: st,
    };
}

fun CCIPSendExecutor.store(self) {
    contract.setData(self.data.toCell());
}

fun CCIPSendExecutor.onExecute(mutate self) {
    val onramp_send = lazy self.data.onrampSend.msg.load();
    if (!onramp_send.tokenAmounts.beginParse().isEmpty()) {
        return; // wait for jettons
    }

    val config = lazy self.data.config.load();
    // call into feeQuoter to validate and calculate fees
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO
        dest: config.feeQuoter,
        body: FeeQuoter_GetValidatedFee<Metadata> {
            msg: self.data.onrampSend.msg,
            metadata: self.data.onrampSend.metadata.toCell(), // TODO: must include nonce
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);

    self.data.executionStatus = CCIPSendExecutor_OnGoingFeeValidation {};
}

fun CCIPSendExecutor.onMessageValidated(mutate self, msg: FeeQuoter_MessageValidated<Metadata>, sender: address) {
    // notification must come from fee quoter
    val config = lazy self.data.config.load();
    assert(config.feeQuoter == sender, ERROR_UNAUTHORIZED);

    if (msg.fee > contract.getOriginalBalance()) {
        // TODO: handle insufficient funds
    }

    // TODO query token registry if needed

    self.exitSuccessfully(msg.fee);
}

fun CCIPSendExecutor.exitSuccessfully(self, fee: coins) {
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: self.data.onramp,
        body: OnRamp_ExecutorFinishedSuccessfully {
            msgId: self.data.messageId,
            msg: self.data.onrampSend.msg,
            metadata: self.data.onrampSend.metadata,
            fee,

        }
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE + SEND_MODE_DESTROY);
}