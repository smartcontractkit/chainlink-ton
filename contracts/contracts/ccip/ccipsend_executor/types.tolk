import "../onramp/messages.tolk";
import "../../deployable/types"

type CCIPSendExecutor_ID = uint224

fun CCIPSendExecutor_DeployableData(owner: address, id: CCIPSendExecutor_ID): cell {
    return Deployable<_CCIPSendExecutor_DeployableData> {
        owner,
        id: _CCIPSendExecutor_DeployableData {
            id: id,
            contractType: stringCrc32("CCIPSendExecutor"),
        },
    }.toCell(); 
}

struct _CCIPSendExecutor_DeployableData {
    id: CCIPSendExecutor_ID;
    contractType: uint256;
}

struct CCIPSendExecutor_InitialData {
    onramp: address,
    id: CCIPSendExecutor_ID,
}

struct CCIPSendExecutor_Data {
    id: CCIPSendExecutor_ID,
    onrampSend: OnRamp_Send,
    addresses: Cell<CCIPSendExecutor_Addresses>,
    state: CCIPSendExecutor_State,
}

struct CCIPSendExecutor_Addresses {
    onramp: address,
    feeQuoter: address,
}

type CCIPSendExecutor_State =
    | Cell<CCIPSendExecutor_State_Initialized>
    | Cell<CCIPSendExecutor_State_OnGoingFeeValidation>

struct CCIPSendExecutor_State_Initialized {
}

struct CCIPSendExecutor_State_OnGoingFeeValidation {
}

struct CCIPSendExecutor_Config {
    feeQuoter: address,
}


