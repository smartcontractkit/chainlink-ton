// SPDX-License-Identifier: BUSL-1.1
import "types"
import "../../lib/utils"
import "../../lib/funding/withdrawable";
import "../../lib/access/access_control";
import "../../lib/versioning/upgradeable"
import "../../lib/jetton/messages"
import "../../lib/receiver/types"
import "../../lib/receiver/messages"
import "../common/types"
import "../accounts/deposit/types"
import "../accounts/deposit/messages"
import "../offramp/types"
import "../offramp/messages"
import "../onramp/messages"
import "../pools/lib/token_pool/messages"
import "../pools/lib/token_pool/types"
import "../rmn_remote/lib"
import "../accounts/deposit/messages"
import "../../lib/deployable/types"

type Router_InMsg =
    | Router_CCIPSend
    | Router_ApplyRampUpdates
    | Router_GetValidatedFee_V1
    | Router_GetValidatedFee
    | OnRamp_MessageValidated
    | OnRamp_MessageValidationFailed
    | Router_RouteMessage
    | Router_WithdrawToTokenPool
    | Router_CCIPReceiveConfirm
    | Upgradeable_Upgrade
    | Withdrawable_Withdraw
    | Router_RMNRemoteCurse
    | Router_RMNRemoteUncurse
    | Router_RMNAccessControlMessage
    | Router_RMNRemoteVerifyNotCursed
    | Router_MessageSent
    | Router_MessageRejected
    | Router_LockOrBurn
    | Router_RelayReleaseOrMint
    | Router_RMNOwnableMessage
    | Router_TokenTransferDelivered
    | Router_GetOnRampAccount
    | DepositAccount_Reply
    | DepositAccount_NotEnoughValue
    | DepositAccount_WithdrawFailed
    | TransferNotificationForRecipient;

type Router_BouncedMessage = 
    | Receiver_CCIPReceiveV2
    | OffRamp_CCIPReceiveConfirm
    | OffRamp_CCIPReceiveBounced;

type Router_RichBouncedMessage =
    | TokenPool_LockOrBurn
    | TokenPool_ReleaseOrMint
    | Deployable_Initialize
    | DepositAccount_Init;

// update multiple chain selectors in batch to the same onramp/offramp address
struct (0x7db6745d) Router_ApplyRampUpdates {
    queryId: uint64;
    onRampUpdates: OnRamps? = null;
    offRampAdds: OffRamps? = null;
    offRampRemoves: OffRamps? = null;
}

// Answers with Router_CCIPReceive
struct (0x31768d95) Router_CCIPSend {
    queryID: uint64;
    destChainSelector: uint64;
    receiver: CrossChainAddress;
    data: cell;
    tokenAmounts: SnakedCell<TokenAmount>;
    feeToken: address?;
    extraArgs: Cell<ExtraArgs>;
}

struct (0xfc69c50b) Router_RouteMessage {
    queryId: uint64;
    message: Cell<Any2TVMMessage>;
    execId: ReceiveExecutorId;
    receiver: address;
    gasLimit: coins;
}

struct (0x19f0098f) Router_WithdrawToTokenPool {
    queryID: uint64;
    destChainSelector: uint64;
    withdrawRequest: Cell<Router_WithdrawRequest>;
}

struct Router_WithdrawRequest {
    /// Jetton wallet of the sender's deposit account, derived by the SendExecutor
    /// (RequestWalletAddress with `ownerAddress` = the deposit account).
    accountWalletAddress: address;
    /// The sender's per-user deposit account the withdraw is forwarded to.
    depositAccount: address;
    amount: coins;
    tokenPool: address;
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
}

/// Permissionless: deploys (or re-confirms) the sender's onramp account for `token`.
/// The account is a Deployable-namespaced OnRampAccount owned by the Router, keyed by the
/// (sender, token) pair. The Router answers with Router_UseOnRampAccount once the account
/// confirms initialization (DepositAccount_Reply).
struct (0x0e24d5ba) Router_GetOnRampAccount {
    queryId: uint64;
    /// Jetton master the account will escrow. One account per (sender, token).
    token: address;
}

/// Sent to a user once their onramp account confirmed initialization: `account` is the
/// address the user must send `token` jettons to (via its jetton wallet).
struct (0xf28658e0) Router_UseOnRampAccount {
    queryId: uint64;
    account: address;
    token: address;
}

struct (0x1e55bbf6) Router_CCIPReceiveConfirm {
    queryId: uint64;
    execId: ReceiveExecutorId;
}

// curse/uncurse/verify uncursed (also as getter)
struct (0xf3388046) Router_RMNRemoteCurse {
    queryId: uint64
    subjects: SnakedCell<uint128>
}

struct (0x3f153a31) Router_RMNRemoteUncurse {
    queryId: uint64
    subjects: SnakedCell<uint128>
}

// Internal contracts can have their own cache, but external contracts will need to fetch the curse status via this method.
struct (0x0b95aa4e) Router_RMNRemoteVerifyNotCursed {
    queryId: uint64
    subject: uint128
}

struct (0x22ba83b3) Router_RMNRemoteVerifyNotCursedResponse {
    queryId: uint64
    result: bool
}

struct (0x6513f8e1) Router_MessageSent {
    queryID: uint64;
    messageId: uint256;
    destChainSelector: uint64;
    sender: address;
}

struct (0x8ae25114) Router_MessageRejected {
    queryID: uint64;
    destChainSelector: uint64;
    sender: address;
    error: uint256;
}

struct (0xaf7a9ac6) Router_RMNOwnableMessage {
    content: RemainingBitsAndRefs; // Ownable2Step_Messages
}

/// Wraps the standard `AccessControl` messages so RBAC changes on the RMN
/// curse policy do not collide with the Router's own top-level messages.
struct (0xf9123a10) Router_RMNAccessControlMessage {
    content: Cell<AccessControl_InMessage>;
}

struct (0x78d0f21e) Router_CCIPSendACK {
    queryID: uint64;
    messageId: uint256;
}

struct (0x5a45d434) Router_CCIPSendNACK {
    queryID: uint64;
    error: uint256;
}

@deprecated("use Router_GetValidatedFee instead")
// nolint:opcode : crc32('Router_GetValidatedFee')
struct (0x4dd6aa82) Router_GetValidatedFee_V1 {
    ccipSend: Cell<Router_CCIPSend>;
    context: RemainingBitsAndRefs;
}

// nolint:opcode : crc32('Router_GetValidatedFee_V2')
struct (0x657ef7ec) Router_GetValidatedFee {
    ccipSend: Cell<Router_CCIPSend>;
    context: cell? = null;
}

struct (0x6f2d00df) Router_LockOrBurn {
    queryID: uint64,
    tokenPool: address,
    request: Cell<TokenPool_LockOrBurnInV1>,
    executorAddress: address,
}

/// Relays an inbound token operation from the registered OffRamp to the pool.
/// The Router binds the authenticated OffRamp selector to the selector encoded
/// in the pool request and applies its own RMN policy before dispatch.
struct (0xb19862a3) Router_RelayReleaseOrMint {
    queryID: uint64;
    sourceChainSelector: uint64;
    tokenPool: address;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    requestedFinalityConfig: uint32;
    replyTo: address;
}

/// Sent by the OffRamp once a ReceiveExecutor confirmed the released/minted tokens reached the
/// receiver's deposit account. Relayed to the pool as `TokenPool_ReleaseOrMintDelivered`.
struct (0xddfdefa8) Router_TokenTransferDelivered {
    queryId: uint64;
    tokenPool: address;
    transfer: Cell<TokenPool_DeliveredTransfer>;
}

/// Context echoed through a user's on-ramp account `DepositAccount_Init`, so the Router can tell
/// that leg apart from the inbound relay leg when the account replies.
struct (0x9e339227) Router_OnRampAccountContext {
    user: address;
    token: address;
}

/// The two contexts the Router carries in a `DepositAccount_Init.forwardPayload` and gets back in
/// the account's `DepositAccount_Reply`: the inbound release/mint relay to resume, or the
/// user-initiated on-ramp account deployment to confirm.
type Router_DepositAccountInitContext =
    | Router_RelayReleaseOrMint
    | Router_OnRampAccountContext;

struct Router_GetValidatedFeeContext {
    routerContext: address // sender
    oldContextVersion: bool
    userContext: cell?
}

// --- Outgoing messages ---

@deprecated("use Router_MessageValidated instead")
// nolint:opcode : crc32('Router_MessageValidated')
struct (0x9e2155ec) Router_MessageValidated_V1 {
    fee: coins
    msg: Cell<Router_CCIPSend>
    context: RemainingBitsAndRefs,
}

@deprecated("use Router_MessageValidationFailed instead")
// nolint:opcode : crc32('Router_MessageValidationFailed')
struct (0xec23c562) Router_MessageValidationFailed_V1 {
    error: uint256,
    msg: Cell<Router_CCIPSend>,
    context: RemainingBitsAndRefs,
}

// --- Outgoing messages ---

// nolint:opcode : crc32('Router_MessageValidated_V2')
struct (0x97ca8bd8) Router_MessageValidated {
    fee: coins
    msg: Cell<Router_CCIPSend>
    context: cell?
}

// nolint:opcode : crc32('Router_MessageValidationFailed_V2')
struct (0xe32e5616) Router_MessageValidationFailed {
    error: uint256,
    msg: Cell<Router_CCIPSend>,
    context: cell?
}

/// Canonical Router failure returned when a LockOrBurn request bounced before
/// the token pool admitted it.
struct (0xb76e3a84) Router_TokenPoolLockOrBurnFailed {
    queryID: uint64;
    tokenPool: address;
    exitCode: int32;
}

/// Canonical Router failure for an inbound release/mint that the Router could
/// not complete (lane cursed, or the pool bounced the relay).
///
/// It is sent to the OffRamp that owns the source lane, which is the only
/// authority allowed to fail a ReceiveExecutor. The OffRamp authenticates the
/// Router by `sourceChainSelector` and forwards the failure to `replyTo`.
struct (0xb980cb4e) Router_TokenPoolReleaseOrMintFailed {
    queryID: uint64;
    sourceChainSelector: uint64;
    replyTo: address;
    tokenPool: address;
    exitCode: int32;
}

// Costs associated with Router operations
struct Router_Costs {}

// Minimum value for calling Router_CCIPSend
fun Router_Costs.CCIPSend(): int {
    return
        + grams("0.001") // computeFee
        + grams("0.019") // CCIPSend fwdFee
        + OnRamp_Costs.Send()
        // TODO add TokenTransfer costs
        ;
}

// Minimum value for calling Router_MessageSent
fun Router_Costs.MessageSent(): int {
    return
        + grams("0.002") // computeFee
        + grams("0.019") // CCIPSendACK fwdFee
        ;

}

// Minimum value for calling Router_MessageRejected
fun Router_Costs.MessageRejected(): int {
    return
        + grams("0.002") // computeFee
        + grams("0.019") // CCIPSendNACK fwdFee
        ;
}

// Minimum value for calling Router_GetValidatedFee
fun Router_Costs.GetValidatedFee(): int {
    return
        grams("0.002") // computeFee
        + grams("0.019") // GetValidatedFee fwdFee
        + OnRamp_Costs.GetValidatedFee()
        + max(
            Router_Costs.MessageValidated(),
            Router_Costs.MessageValidationFailed()
        )
        ;
}

fun Router_Costs.MessageValidated(): int {
    return
        + grams("0.002") // computeFee
        + grams("0.019") // MessageValidated fwdFee
        ;
}

fun Router_Costs.MessageValidationFailed(): int {
    return
        + grams("0.002") // computeFee
        + grams("0.019") // MessageValidationFailed fwdFee
        ;
}

// Minimum value for calling Router_RouteMessage
fun Router_Costs.routeMessage(): int {
    val baseFee = grams("0.004");
    return baseFee + Router_Costs.receiveConfirm();
}

// Minimum value for calling Router_CCIPReceiveConfirm
fun Router_Costs.receiveConfirm(): int {
    val baseFee = ROUTER_RECEIVE_CONFIRM_FEE;
    return baseFee + OffRamp_Costs.receiveConfirmOrDeny();
}

// Minimum value for calling Router_DeployDepositAccount: covers the Router's own compute,
// the Deployable_Initialize + DepositAccount_Init messages, the account's init compute and
// storage, and the DepositAccount_Reply -> Router_UseDepositAccount round-trip.
fun Router_Costs.GetDepositAccount(): int {
    return DepositAccount_MIN_GRAM_TO_RESERVE + DepositAccount_MIN_GRAM_TO_INIT + grams("0.01"); // TODO re-estimate fee of messages processed by the Router
}

const ROUTER_RECEIVE_CONFIRM_FEE = grams("0.002");
