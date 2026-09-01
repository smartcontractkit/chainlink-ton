// SPDX-License-Identifier: BUSL-1.1
import "types"
import "../router/messages"
import "../../lib/utils"
import "../../lib/versioning/upgradeable"
import "../ccipsend_executor/messages"
import "../fee_quoter/messages"
import "../ccipsend_executor/types"
import "../fee_quoter/types"
import "../common/types"

type OnRamp_InMessage =
    | OnRamp_Send
    | OnRamp_GetValidatedFee_Any
    | FeeQuoter_MessageValidated_ToOnRamp
    | FeeQuoter_MessageValidationFailed_ToOnRamp
    | OnRamp_ExecutorRequestsLockOrBurn
    | OnRamp_ExecutorRequestsWithdraw
    | OnRamp_ExecutorFinishedSuccessfully
    | OnRamp_ExecutorFinishedWithError
    | OnRamp_SetDynamicConfig
    | OnRamp_UpdateDestChainConfigs
    | OnRamp_UpdateSendExecutor
    | OnRamp_UpdateAllowlists
    | OnRamp_WithdrawFeeTokens
    | Upgradeable_Upgrade
    ;

// So that ABIgen can generate codec for FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext>
type FeeQuoter_MessageValidated_ToOnRamp = FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext>

// So that ABIgen can generate codec for FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext>
type FeeQuoter_MessageValidationFailed_ToOnRamp = FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext>

type OnRamp_NotificationInMessage =
    | OnRamp_Send
    ;

struct (0xdcf993c2) OnRamp_Send {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<Router_CCIPSend>;
    metadata: Metadata;
    // TODO: consider introducing OnRamp_SendV2 instead of mutating OnRamp_Send to maintain backwards compatibility on the OnRamp upgrade path.
    tokenRegistry: address? = null;
}

// So that ABIgen can generate codec for OnRamp_GetValidatedFee<RemainingBitsAndRefs>
type OnRamp_GetValidatedFee_Any = OnRamp_GetValidatedFee<RemainingBitsAndRefs>

struct (0x9c2ccc7e) OnRamp_GetValidatedFee<T> {
    ccipSend: Cell<Router_CCIPSend>;
    context: T;
}

struct (0x9be1fb61) OnRamp_ExecutorRequestsLockOrBurn {
    queryID: uint64,
    tokenAmount: Cell<TokenAmount>, // Cell<> otherwise they don't fit
    tokenPool: address,
    destChainSelector: uint64,
    executorID: CCIPSendExecutor_ID,
    receiver: Cell<CrossChainAddress>, // Cell<> otherwise they don't fit
    originalSender: address,
}

// TODO real numbers
fun OnRamp_ExecutorRequestsLockOrBurn.cost(): int {
    return ton("1");
}

struct (0x05e47a89) OnRamp_ExecutorRequestsWithdraw {
    queryID: uint64,
    executorID: CCIPSendExecutor_ID,
    destChainSelector: uint64,
    withdrawRequest: Cell<Router_WithdrawRequest>,
}

struct OnRamp_GetValidatedFeeContext {
    onrampContext: address; // router address
    userContext: RemainingBitsOrRef<RemainingBitsAndRefs>,
}

struct (0xa178c62e) OnRamp_SetDynamicConfig {
    config: OnRamp_DynamicConfig
}

struct (0xCFA6B336) OnRamp_ExecutorFinishedSuccessfully {
    executorID: CCIPSendExecutor_ID,
    fee: Fee
    msg: Cell<Router_CCIPSend>
    metadata: Metadata
    // Pool-supplied token transfer details, forwarded so the OnRamp can include them in
    // the emitted CCIPMessageSent event. Null when the message carries no token transfer.
    tokenTransfer: Cell<OnRamp_ExecutorTokenTransfer>?
}

struct (0xC4068E21) OnRamp_ExecutorFinishedWithError {
    executorID: CCIPSendExecutor_ID,
    error: uint256,
    msg: Cell<Router_CCIPSend>,
    metadata: Metadata,
}

struct (0x1a246b6c) OnRamp_UpdateDestChainConfigs {
    updates: SnakedCell<OnRampUpdateDestChainConfig>;
}

struct (0x82901c45) OnRamp_UpdateSendExecutor {
    code: cell;
}

struct (0x9dc06185) OnRamp_UpdateAllowlists {
    updates: SnakedCell<UpdateAllowlist>;
}

// --- Outgoing messages ---

// So that ABIgen can generate codec for OnRamp_MessageValidated<RemainingBitsAndRefs>
type OnRamp_MessageValidated_Any = OnRamp_MessageValidated<RemainingBitsAndRefs>

// crc32('OnRamp_MessageValidated')
struct (0x2afb11bd) OnRamp_MessageValidated<T> {
    fee: coins
    msg: Cell<Router_CCIPSend>
    context: T
}

// So that ABIgen can generate codec for OnRamp_MessageValidationFailed<RemainingBitsAndRefs>
type OnRamp_MessageValidationFailed_Any = OnRamp_MessageValidationFailed<RemainingBitsAndRefs>

// crc32('OnRamp_MessageValidationFailed')
struct (0xac1dd12e) OnRamp_MessageValidationFailed<T> {
    error: uint256,
    msg: Cell<Router_CCIPSend>,
    context: T
}

// TODO: generalized — this was added before TON token support and only supports withdrawing native TON.
// Migrate to the shared `JettonWithdrawable_WithdrawFeeTokens` (lib/funding/jetton_withdrawable.tolk)
// so the OnRamp can also withdraw accrued fee jettons, like the TokenPool does.
struct (0x7052dc75) OnRamp_WithdrawFeeTokens {
    feeTokens: SnakedCell<address>;
}

// Costs associated with OnRamp operations
struct OnRamp_Costs {}

// Minimum value for calling OnRamp_GetValidatedFee
@inline
fun OnRamp_Costs.GetValidatedFee(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // GetValidatedFee fwdFee
        + FeeQuoter_Costs.GetValidatedFee()
        + max(
            OnRamp_Costs.FeeQuoter_MessageValidated(),
            OnRamp_Costs.FeeQuoter_MessageValidationFailed()
        )
        ;
}

// Minimum value for calling FeeQuoter_MessageValidated on OnRamp
@inline
fun OnRamp_Costs.FeeQuoter_MessageValidated(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // MessageValidated fwdFee
        ;
}

// Minimum value for calling FeeQuoter_MessageValidationFailed on OnRamp
@inline
fun OnRamp_Costs.FeeQuoter_MessageValidationFailed(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // MessageValidationFailed fwdFee
        ;
}

// Minimum value for calling OnRamp_Send
@inline
fun OnRamp_Costs.Send(): int {
    return
        + ton("0.002") // computeFee
        + SendExecutor_Costs.Deploy()
        + ton("0.019") // Execute fwdFee
        + SendExecutor_Costs.Execute()
        ;
}

// Minimum value for calling OnRamp_ExecutorFinishedSuccessfully
@inline
fun OnRamp_Costs.ExecutorFinishedSuccessfully(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // emit CCIPMessageSent event
        + ton("0.019") // MessageSent fwdFee
        + Router_Costs.MessageSent() 
        ;
}

// Minimum value for calling OnRamp_ExecutorFinishedWithError
@inline
fun OnRamp_Costs.ExecutorFinishedWithError(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // MessageRejected fwdFee
        + Router_Costs.MessageRejected()
        ;
}

// Minimum value for calling OnRamp_WithdrawFeeTokens
@inline
fun OnRamp_Costs.WithdrawFeeTokens(): int {
    return
        + ton("0.02") // computeFee
        + ton("0.019") // feeTokens fwdFee
        + ton("0.05") // feeCollector computeFee
        ;
}
