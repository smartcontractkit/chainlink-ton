import "types"
import "messages"
import "storage"
import "errors"
import "../fee_quoter/messages"
import "../onramp/messages"
import "../onramp/types"
import "../common/messages"
import "../../lib/utils"
import "../onramp/errors"
import "../router/messages"

const CONTRACT_VERSION = "0.0.6";
const FACILITY_NAME = "com.chainlink.ton.ccip.CCIPSendExecutor";

fun onInternalMessage(in: InMessage) {
    val msg = lazy CCIPSendExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        CCIPSendExecutor_Execute => {
            var this = init(msg.onrampSend, msg.config.load());
            assert (in.senderAddress == contract.getAddress()) throw CCIPSendExecutor_Error.Unauthorized;
            assert (in.valueCoins >= SendExecutor_Costs.Execute()) throw CCIPSendExecutor_Error.InsufficientFee;
            this.onExecute();
        }
        FeeQuoter_MessageValidated<RemainingBitsAndRefs> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            this.onMessageValidated(msg, in.senderAddress);
        }
        FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            this.onMessageValidationFailed(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        },   
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    val msg = lazy CCIPSendExecutor_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());
    match (msg) {
        FeeQuoter_GetValidatedFee<RemainingBitsAndRefs> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            this.exitWithError(CCIPSendExecutor_Error.InsufficientFunds as int, in.senderAddress);
        }
    }
}

fun init(onrampSend: OnRamp_Send, config: CCIPSendExecutor_Config): CCIPSendExecutor<CCIPSendExecutor_State_Initialized> {
    val st = lazy CCIPSendExecutor_InitialData.fromCell(contract.getData());
    return CCIPSendExecutor<CCIPSendExecutor_State_Initialized> {
        id: st.id,
        onrampSend: onrampSend,
        addresses: CCIPSendExecutor_Addresses {
            onramp: st.onramp,
            feeQuoter: config.feeQuoter,
        }.toCell(),
        state: CCIPSendExecutor_State_Initialized{
        }.toCell(),
    };
}

fun CCIPSendExecutor<CCIPSendExecutor_State_Initialized>.onExecute(mutate self) {
    getValidatedFee(self.addresses.load().feeQuoter, self.onrampSend);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_OnGoingFeeValidation {
        }.toCell(),
    };
    newState.store();
}

fun getValidatedFee(feeQuoter: address, onrampSend: OnRamp_Send) {
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: FeeQuoter_Costs.GetValidatedFee(),
        dest: feeQuoter,
        body: FeeQuoter_GetValidatedFee<slice> {
            msg: onrampSend.msg,
            context: createEmptySlice(),
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidated(mutate self, msg: FeeQuoter_MessageValidated<RemainingBitsAndRefs>, sender: address) {
    // notification must come from fee quoter
    val addresses = lazy self.addresses.load();
    assert(addresses.feeQuoter == sender, CCIPSendExecutor_Error.Unauthorized);

    if (msg.fee + Router_Costs.CCIPSend() > self.onrampSend.metadata.value) {
        self.exitWithError(CCIPSendExecutor_Error.InsufficientFunds as int, sender);
        return;
    }
    
    self.exitSuccessfully(msg.fee);
}

fun CCIPSendExecutor<T>.exitSuccessfully(self, fee: coins) {
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorFinishedSuccessfully {
            fee,
            executorID: self.id,
            msg: self.onrampSend.msg,
            metadata: self.onrampSend.metadata,
        }
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidationFailed(mutate self, msg: FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>, sender: address) {
    // notification must come from fee quoter
    val addresses = lazy self.addresses.load();
    assert(addresses.feeQuoter == sender, CCIPSendExecutor_Error.Unauthorized);
    self.exitWithError(msg.error as uint256, sender);
}

fun CCIPSendExecutor<T>.exitWithError(self, error: uint256, sender: address) {
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorFinishedWithError {
            executorID: self.id,
            error: error,
            msg: self.onrampSend.msg,
            metadata: self.onrampSend.metadata,
        }
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE);
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
