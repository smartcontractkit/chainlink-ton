import "types"
import "messages"
import "storage"
import "errors"
import "../fee_quoter/messages"
import "../onramp/messages"
import "../../lib/utils"
import "../onramp/errors"
import "../router/messages"
import "../fee_quoter/types"
import "@stdlib/gas-payments"

const CONTRACT_VERSION = "1.6.0";
const FACILITY_NAME = "com.chainlink.ton.ccip.CCIPSendExecutor";

fun onInternalMessage(in: InMessage) {
    val msg = lazy CCIPSendExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        // Sender must be this contract (called when initializing the contract)
        CCIPSendExecutor_Execute => {
            var this = init(msg.onrampSend, msg.config.load());
            assert (in.senderAddress == contract.getAddress()) throw CCIPSendExecutor_Error.Unauthorized;
            assert (in.valueCoins >= SendExecutor_Costs.Execute()) throw CCIPSendExecutor_Error.InsufficientFee;
            this.onExecute();
        }
        // Sender must be the Fee Quoter
        FeeQuoter_MessageValidated<RemainingBitsAndRefs> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            assert(this.addresses.load().feeQuoter == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onMessageValidated(msg);
        }
        // Sender must be the Fee Quoter
        FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            assert(this.addresses.load().feeQuoter == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onMessageValidationFailed(msg);
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
            this.exitWithError(CCIPSendExecutor_Error.FeeQuoterBounce as int);
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

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidated(mutate self, msg: FeeQuoter_MessageValidated<RemainingBitsAndRefs>) {
    if (msg.fee.feeTokenAmount + Router_Costs.CCIPSend() > self.onrampSend.metadata.value) {
        self.exitWithError(CCIPSendExecutor_Error.InsufficientFunds as int);
        return;
    }
    setGasLimitToMaximum();
    
    self.exitSuccessfully(msg.fee);
}

fun CCIPSendExecutor<T>.exitSuccessfully(self, fee: Fee) {
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_Finalized> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_Finalized {
        }.toCell(),
    };
    newState.store();

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

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidationFailed(mutate self, msg: FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>) {
    self.exitWithError(msg.error as uint256);
}

fun CCIPSendExecutor<T>.exitWithError(self, error: uint256) {
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_Finalized> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_Finalized {
        }.toCell(),
    };
    newState.store();
    
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
