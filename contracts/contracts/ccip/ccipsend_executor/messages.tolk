import "../../lib/jetton/messages"

import "../router/messages"
import "../onramp/messages"
import "../fee_quoter/messages"
import "../token_admin_registry/messages"
import "../pools/lib/token_pool/messages"

import "types"

type CCIPSendExecutor_InMessage =
    | CCIPSendExecutor_Execute
    | FeeQuoter_MessageValidated
    | FeeQuoter_MessageValidationFailed
    | OnRamp_ExecutorFeeReserved
    | TokenAdminRegistry_TokenInfo
    | TokenAdminRegistry_GetTokenInfoFailed
    | TokenPool_LockOrBurnWithdraw
    | TokenPool_LockOrBurnFinished
    | TokenPool_LockOrBurnFailure
    | Router_TokenPoolLockOrBurnFailed;

// crc32('CCIPSendExecutor_Execute')
struct (0xaf3c62b3) CCIPSendExecutor_Execute {
    onrampSend: OnRamp_Send,
    config: Cell<CCIPSendExecutor_Config>,
}

// Costs associated with SendExecutor operations
struct SendExecutor_Costs {}

// Constants are 3x the measured compute and 2x the measured forward fees (tests/gas-report/ccip) for a MAX_DATA_CELLS message.

// Deployable.initializeAndSend: computeFee + the self message fwdFee (carries the message)
@inline
fun SendExecutor_Costs.Deploy(): int {
    return grams("0.0395");
}

// Minimum value for calling CCIPSendExecutor_Execute: the fee validation round trip.
@inline
fun SendExecutor_Costs.Execute(): int {
    return
        + grams("0.04") // computeFee + GetValidatedFee fwdFee
        + FeeQuoter_Costs.GetValidatedFee()
        + max(SendExecutor_Costs.MessageValidated(), SendExecutor_Costs.MessageValidationFailed())
        ;
}

// Value the executor keeps on its balance after the self message: the fee reservation round trip,
// the token path and the finalization, all paid from the balance.
@inline
fun SendExecutor_Costs.Reserve(hasTokens: bool): int {
    return
        + OnRamp_Costs.ExecutorReserveFee()
        + grams("0.0025") // OnRamp_ExecutorFeeReserved computeFee
        + (hasTokens ? SendExecutor_Costs.TokenTransfer() : 0)
        + SendExecutor_Costs.Finalize()
        ;
}

// Token path between the fee reservation and the finalization.
@inline
fun SendExecutor_Costs.TokenTransfer(): int {
    return
        + TokenAdminRegistry_GetTokenInfo.cost()
        + grams("0.003") // TokenAdminRegistry_TokenInfo computeFee + ExecutorRequestsLockOrBurn fwdFee
        + OnRamp_ExecutorRequestsLockOrBurn.cost(TOKEN_POOL_DEFAULT_LOCK_OR_BURN_ADMISSION)
        ;
}

// Exit of the executor: the hop sending ExecutorFinishedSuccessfully (or FinishedWithError)
// carries the message, then the OnRamp emits it and confirms to the Router.
@inline
fun SendExecutor_Costs.Finalize(): int {
    return
        + grams("0.0405") // computeFee + ExecutorFinishedSuccessfully fwdFee
        + max(OnRamp_Costs.ExecutorFinishedSuccessfully(), OnRamp_Costs.ExecutorFinishedWithError())
        ;
}

@inline
fun SendExecutor_Costs.MessageValidated(): int {
    return grams("0.0025"); // computeFee + ExecutorReserveFee fwdFee
}

@inline
fun SendExecutor_Costs.MessageValidationFailed(): int {
    return grams("0.0025"); // computeFee + ExecutorFinishedWithError fwdFee
}

type CCIPSendExecutor_BouncedMessage =
    | FeeQuoter_GetValidatedFee
    | OnRamp_ExecutorReserveFee
    | TokenAdminRegistry_GetTokenInfo
    ;
