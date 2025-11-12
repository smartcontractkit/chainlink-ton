import "types"
import "storage"
import "../../lib/versioning/upgradeable"

import "../common/messages"
import "../onramp/messages"
import "../router/messages"
import "../onramp/types"
import "../fee_quoter/messages"

type CCIPSendExecutor_InMessage =
    | CCIPSendExecutor_Execute
    | CCIPSendExecutor_MessageValidated<Metadata>
    | CCIPSendExecutor_MessageValidationFailed<Metadata>
   
// crc32('CCIPSendExecutor_Execute')
struct (0xaf3c62b3) CCIPSendExecutor_Execute {
    onrampSend: OnRamp_Send,
    config: Cell<CCIPSendExecutor_Config>,
}

// crc32('CCIPSendExecutor_MessageValidated')
struct (0xcbc4af76) CCIPSendExecutor_MessageValidated<C> {
    msg: Cell<Router_CCIPSend>
    metadata: Cell<C>
    fee: coins
}

// crc32('CCIPSendExecutor_MessageValidationFailed')
struct (0x0f756150) CCIPSendExecutor_MessageValidationFailed<C> {
    msg: Cell<Router_CCIPSend>,
    metadata: Cell<C>,
    error: uint256,
}

// Costs associated with SendExecutor operations
struct SendExecutor_Costs {}

// Minimum value for calling SendExecutor_GetValidatedFee
@inline
fun SendExecutor_Costs.Execute(): int {
    var baseFee =
        ton("0.05") // GetValidatedFee fwdFee
        + FeeQuoter_Costs.GetValidatedFee()
        ;
    return baseFee;
}

@inline
fun SendExecutor_Costs.MessageValidated(): int {
    return ton("0.05") // ExecutorFinishedSuccessfully fwdFee
        + OnRamp_Costs.ExecutorFinishedSuccessfully();
}

@inline
fun SendExecutor_Costs.MessageValidationFailed(): int {
    return ton("0.05") // ExecutorFinishedWithError fwdFee
        + OnRamp_Costs.ExecutorFinishedWithError();
}

type CCIPSendExecutor_BouncedMessage =
    | FeeQuoter_GetValidatedFee<Metadata>
    ;