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
    | OnRamp_GetValidatedFee
    | FeeQuoter_MessageValidated
    | FeeQuoter_MessageValidationFailed
    | OnRamp_ExecutorRequestsLockOrBurn
    | OnRamp_ExecutorRequestsWithdraw
    | OnRamp_ExecutorReserveFee
    | OnRamp_ExecutorFinishedSuccessfully
    | OnRamp_ExecutorFinishedWithError
    | OnRamp_SetDynamicConfig
    | OnRamp_UpdateDestChainConfigs
    | OnRamp_UpdateAllowlists
    | OnRamp_WithdrawFeeTokens
    | Upgradeable_Upgrade
    ;


type OnRamp_NotificationInMessage =
    | OnRamp_Send
    ;

struct (0xdcf993c2) OnRamp_Send {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<Router_CCIPSend>;
    metadata: Metadata;
}

struct (0x9c2ccc7e) OnRamp_GetValidatedFee {
    ccipSend: Cell<Router_CCIPSend>;
    context: cell? = null;
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

/// Placeholder for the lock/burn value the TokenAdminRegistry will report per pool. Must stay
/// above the Router's 0.5 TON jetton forward plus the wallet fees until that forward is removed.
const TOKEN_POOL_LOCK_OR_BURN_VALUE: coins = grams("1");

/// Value the executor attaches to a lock/burn request: the CCIP relays to and from the pool
/// (OnRamp, Router, deposit account withdraw) plus what the pool itself requires.
fun OnRamp_ExecutorRequestsLockOrBurn.cost(poolValue: coins): int {
    return
        + grams("0.0035") // OnRamp ExecutorRequestsLockOrBurn relay
        + grams("0.004") // Router_LockOrBurn relay
        + grams("0.0065") // SendExecutor TokenPool_LockOrBurnWithdraw
        + grams("0.005") // OnRamp ExecutorRequestsWithdraw relay
        + grams("0.004") // Router_WithdrawToTokenPool relay
        + grams("0.0045") // DepositAccount_Withdraw
        + grams("0.0015") // jetton excess returned to the OnRamp
        + poolValue
        ;
}

struct (0x05e47a89) OnRamp_ExecutorRequestsWithdraw {
    queryID: uint64,
    executorID: CCIPSendExecutor_ID,
    destChainSelector: uint64,
    // Destination chain family echoed from the FeeQuoter's validation reply.
    chainFamilySelector: uint32,
    destBytesOverhead: uint32,
    withdrawRequest: Cell<Router_WithdrawRequest>,
}

// Sent by the executor immediately after fee validation. The attached value
// includes `fee` plus enough TON for this request and its confirmation.
struct (0xb6bbebdb) OnRamp_ExecutorReserveFee {
    executorID: CCIPSendExecutor_ID,
    fee: coins,
}

// The OnRamp sends this only after it has reserved the requested fee.
struct (0x540a6d81) OnRamp_ExecutorFeeReserved {
    executorID: CCIPSendExecutor_ID,
}

struct OnRamp_GetValidatedFeeContext {
    onrampContext: address; // router address
    userContext: cell?,
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
    // Snapshotted pre-custody, so these are the values the OnRamp validated.
    tokenTransfer: Cell<OnRamp_ExecutorTokenTransfer>?
}

struct (0xC4068E21) OnRamp_ExecutorFinishedWithError {
    queryID: uint64
    executorID: CCIPSendExecutor_ID
    destChainSelector: uint64
    sender: address
    error: uint256
    refund: Cell<coins>?
}

struct (0x1a246b6c) OnRamp_UpdateDestChainConfigs {
    updates: SnakedCell<OnRampUpdateDestChainConfig>;
}

struct (0x9dc06185) OnRamp_UpdateAllowlists {
    updates: SnakedCell<UpdateAllowlist>;
}

// --- Outgoing messages ---

// crc32('OnRamp_MessageValidated')
struct (0x2afb11bd) OnRamp_MessageValidated {
    fee: coins
    msg: Cell<Router_CCIPSend>
    context: cell?
}

// crc32('OnRamp_MessageValidationFailed')
struct (0xac1dd12e) OnRamp_MessageValidationFailed {
    error: uint256,
    msg: Cell<Router_CCIPSend>,
    context: cell?
}

// TODO: once fee token support is added, migrate this to use lib/funding/jetton_withdrawable.tolk
struct (0x7052dc75) OnRamp_WithdrawFeeTokens {
    feeTokens: SnakedCell<address>;
}

// Costs associated with OnRamp operations
struct OnRamp_Costs {}

// Constants are 5x the cost measured by tests/gas-report/ccip for a MAX_DATA_CELLS message.

// Minimum value for calling OnRamp_GetValidatedFee
@inline
fun OnRamp_Costs.GetValidatedFee(): int {
    return
        + grams("0.1") // computeFee + GetValidatedFee fwdFee
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
    return grams("0.1"); // computeFee + MessageValidated fwdFee
}

// Minimum value for calling FeeQuoter_MessageValidationFailed on OnRamp
@inline
fun OnRamp_Costs.FeeQuoter_MessageValidationFailed(): int {
    return grams("0.1"); // computeFee + MessageValidationFailed fwdFee
}

// Minimum value for calling OnRamp_Send
@inline
fun OnRamp_Costs.Send(hasTokens: bool): int {
    return
        + grams("0.12") // computeFee + InitializeAndSend fwdFee (executor code and message)
        + SendExecutor_Costs.Deploy()
        + SendExecutor_Costs.Execute()
        + SendExecutor_Costs.Reserve(hasTokens)
        ;
}

// Minimum value for calling OnRamp_ExecutorFinishedSuccessfully
@inline
fun OnRamp_Costs.ExecutorFinishedSuccessfully(): int {
    return
        + grams("0.105") // computeFee + CCIPMessageSent event + MessageSent fwdFee
        + Router_Costs.MessageSent()
        ;
}

// Minimum value for the executor's fee reservation request. The fee itself is
// attached separately and is kept on the OnRamp by reserveGramsOnBalance.
@inline
fun OnRamp_Costs.ExecutorReserveFee(): int {
    return grams("0.0025"); // computeFee + ExecutorFeeReserved fwdFee
}

// Minimum value for calling OnRamp_ExecutorFinishedWithError. Not measured yet; sized like the
// success path, which carries more.
@inline
fun OnRamp_Costs.ExecutorFinishedWithError(): int {
    return
        + grams("0.105") // computeFee + MessageRejected fwdFee
        + Router_Costs.MessageRejected()
        ;
}

// Minimum value for calling OnRamp_WithdrawFeeTokens
@inline
fun OnRamp_Costs.WithdrawFeeTokens(): int {
    return
        + grams("0.02") // computeFee
        + grams("0.019") // feeTokens fwdFee
        + grams("0.05") // feeCollector computeFee
        ;
}
