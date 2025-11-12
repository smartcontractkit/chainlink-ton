import "types"
import "../common/types"
import "../common/messages"
import "../router/messages"
import "../../lib/utils"
import "../../lib/funding/withdrawable"
import "../../lib/versioning/upgradeable"
import "../ccipsend_executor/messages"
import "../fee_quoter/messages"

type OnRamp_InMessage =
    | OnRamp_Send
    | OnRamp_GetValidatedFee<RemainingBitsAndRefs>
    | FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext>
    | FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext>
    | OnRamp_ExecutorFinishedSuccessfully
    | OnRamp_ExecutorFinishedWithError
    | OnRamp_SetDynamicConfig
    | OnRamp_UpdateDestChainConfigs
    | OnRamp_UpdateAllowlists
    | Withdrawable_Withdraw
    | Upgradeable_Upgrade
    ;
    // TODO | UpdateExecutorCode

type OnRamp_NotificationInMessage =
    | OnRamp_Send
    ;

struct (0x10000002) OnRamp_Send {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<Router_CCIPSend>;
    metadata: Metadata
}

struct (0x9c2ccc7e) OnRamp_GetValidatedFee<T> {
    ccipSend: Cell<Router_CCIPSend>;
    context: T;
}

struct OnRamp_GetValidatedFeeContext {
    onrampContext: address; // onramp address
    userContext: RemainingBitsOrRef<RemainingBitsAndRefs>,
}

// crc32('OnRamp_WithdrawJettons')
struct (0x266AEACF) OnRamp_WithdrawJettons {
    msgId: uint224,
    tokens: SnakedCell<TokenAmount>;
    onrampJettonWallet: address;
}

struct (0x10000003) OnRamp_SetDynamicConfig {
    config: OnRamp_DynamicConfig
}

// crc32('OnRamp_ExecutorFinishedSuccessfully')
struct (0xCFA6B336) OnRamp_ExecutorFinishedSuccessfully {
    msgID: uint224,
    msg: Cell<Router_CCIPSend>
    metadata: Metadata
    fee: coins
}

struct (0xC4068E21) OnRamp_ExecutorFinishedWithError {
    msgID: uint224,
    msg: Cell<Router_CCIPSend>,
    metadata: Metadata,
    error: uint256,
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000004) OnRamp_UpdateDestChainConfigs {
    updates: cell; // vec<OffRampUpdateDestChainConfig>
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000005) OnRamp_UpdateAllowlists {
    updates: cell; // vec<UpdateAllowlist>
}

// --- Outgoing messages ---

// crc32('OnRamp_MessageValidated')
struct (0x2afb11bd) OnRamp_MessageValidated<T> {
    msg: Cell<Router_CCIPSend>
    fee: coins
    context: T
}

// crc32('OnRamp_MessageValidationFailed')
struct (0xac1dd12e) OnRamp_MessageValidationFailed<T> {
    msg: Cell<Router_CCIPSend>,
    error: uint256,
    context: T
}



// Costs associated with OnRamp operations
struct OnRamp_Costs {}

// Minimum value for calling OnRamp_GetValidatedFee
@inline
fun OnRamp_Costs.GetValidatedFee(): int {
    return
        + ton("0.02") // GetValidatedFee fwdFee
        + FeeQuoter_Costs.GetValidatedFee()
}

// Minimum value for calling OnRamp_Send
@inline
fun OnRamp_Costs.Send(): int {
    return
        + ton("0.05") // SendExecutor deployment
        + ton("0.05") // Execute fwdFee
        + SendExecutor_Costs.Execute()
        ;
}

// Minimum value for calling OnRamp_ExecutorFinishedSuccessfully
@inline
fun OnRamp_Costs.ExecutorFinishedSuccessfully(): int {
    return
        Router_Costs.MessageSent() + ton("0.05") // Fwd fee // TODO
        ;
}

// Minimum value for calling OnRamp_ExecutorFinishedWithError
@inline
fun OnRamp_Costs.ExecutorFinishedWithError(): int {
    return
        Router_Costs.MessageRejected() + ton("0.05") // Fwd fee // TODO
        ;
}