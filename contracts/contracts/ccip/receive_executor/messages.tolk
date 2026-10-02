// SPDX-License-Identifier: BUSL-1.1
import "../offramp/messages"
import "../offramp/types"
import "../token_admin_registry/messages"
import "../pools/lib/token_pool/messages"
import "types"


type ReceiveExecutor_InMessage =
    | ReceiveExecutor_InitExecute
    | TokenAdminRegistry_TokenInfo
    | TokenAdminRegistry_GetTokenInfoFailed
    | TokenPool_ReleaseOrMintFinished
    | TokenPool_ReleaseOrMintFailure
    | ReceiveExecutor_ReleaseOrMintFailed
    | ReceiveExecutor_CCIPReceiveFailed
    | ReceiveExecutor_CCIPReceiveConfirm
    ;

struct (0x64cd2fd2) ReceiveExecutor_InitExecute {
    queryId: uint64;
    effectiveGasLimit: coins;
    root: address;
    sequenceNumber: uint64;
    sourceChainSelector: uint64;
    messageId: uint256;
    tokenTransfer: Cell<ReceiveExecutor_TokenTransfer>? = null;
}

struct ReceiveExecutor_TokenTransfer {
    tokenAdminRegistry: address;
    transfer: Any2TVMTokenTransfer;
    // Offchain token data for this token transfer (untrusted).
    // Null when there is no offchain data for this token.
    offchainTokenData: cell? = null;
}

// Sent by the off-ramp to the receive executor when a release or mint operation has reverted.
struct (0xdf58530e) ReceiveExecutor_ReleaseOrMintFailed {
    queryId: uint64;
    reason: ReleaseOrMint_ReleaseOrMintFailedReason;
}

type ReleaseOrMint_ReleaseOrMintFailedReason =
    | ReleaseOrMintBounced
    | NotEnoughDestGasAmountForTokenTransfer;

struct (0xb70c2a9a) ReleaseOrMintBounced {
    exitCode: int32
}

struct (0xb304ecdf) NotEnoughDestGasAmountForTokenTransfer {}

struct (0xf0af71c5) ReceiveExecutor_CCIPReceiveConfirm {
    queryId: uint64;
    receiver: address
}

struct (0x8854993b) ReceiveExecutor_CCIPReceiveFailed {
    queryId: uint64;
    receiver: address
    reason: ReceiveExecutor_FailedReason;
}

enum ReceiveExecutor_FailedReason: uint8 {
    NotEnoughGas = 0,
    BouncedFromReceiver,
    BouncedFromRouter,
} 

const RECEIVE_EXECUTOR_COSTS_CONFIRMED_OR_BOUNCED_FEE = grams("0.005");
const RECEIVE_EXECUTOR_COSTS_INIT_EXEC_FEE = grams("0.004");
const RECEIVE_EXECUTOR_COSTS_TOKEN_INFO_FEE = grams("0.005");

struct ReceiveExecutor_Costs{}

fun ReceiveExecutor_Costs.initExec(): int {
    val baseFee = RECEIVE_EXECUTOR_COSTS_INIT_EXEC_FEE;
    return baseFee + OffRamp_Costs.dispatchValidated();
}

fun ReceiveExecutor_Costs.confirmedOrBounced(): int {
    val baseFee = RECEIVE_EXECUTOR_COSTS_CONFIRMED_OR_BOUNCED_FEE;
    return baseFee + OffRamp_Costs.notify();
}

/// The registry query, handling its reply, and the message that follows it:
/// ReleaseOrMint, or NotifyFailure when the token is not enabled. The
/// destGasAmount for ReleaseOrMint is budgeted separately.
fun ReceiveExecutor_Costs.tokenTransfer(): int {
    return TokenAdminRegistry_GetTokenInfo.cost()
        + RECEIVE_EXECUTOR_COSTS_TOKEN_INFO_FEE
        + max(OffRamp_ReleaseOrMint.cost(), OffRamp_Costs.notify());
}
