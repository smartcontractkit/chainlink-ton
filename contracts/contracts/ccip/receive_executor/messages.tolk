// SPDX-License-Identifier: BUSL-1.1
import "../offramp/messages"
import "../offramp/types"
import "../token_registry/messages"
import "../pools/lib/token_pool/messages"


type ReceiveExecutor_InMessage =
    | ReceiveExecutor_InitExecute
    | TokenRegistry_ReturnTokenInfo
    | TokenPool_ReleaseOrMintFinished
    | TokenPool_ReleaseOrMintFailure
    | ReleaseOrMint_ReleaseOrMintFailed
    | ReceiveExecutor_CCIPReceiveFailed
    | ReceiveExecutor_CCIPReceiveConfirm
    ;

struct (0x64cd2fd2) ReceiveExecutor_InitExecute {
    gasOverride: GasOverride? = null;
    root: address;
    sequenceNumber: uint64;
    sourceChainSelector: uint64;
    messageId: uint256;
    tokenTransfers: array<ReceiveExecutor_TokenTransfer>? = null;
}

struct ReceiveExecutor_TokenTransfer {
    tokenAdminRegistry: address;
    transfer: Any2TVMTokenTransfer;
}

// Sent by the off-ramp to the receive executor when a release or mint operation has reverted.
struct (0x5845e468) ReleaseOrMint_ReleaseOrMintFailed {
    queryID: uint64;
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
    receiver: address
}

struct (0x8854993b) ReceiveExecutor_CCIPReceiveFailed {
    receiver: address
    reason: ReceiveExecutor_FailedReason;
}

enum ReceiveExecutor_FailedReason: uint8 {
    NotEnoughGas = 0,
    BouncedFromReceiver,
    BouncedFromRouter,
} 

const RECEIVE_EXECUTOR_COSTS_CONFIRMED_OR_BOUNCED_FEE = ton("0.005");
const RECEIVE_EXECUTOR_COSTS_INIT_EXEC_FEE = ton("0.004");

struct ReceiveExecutor_Costs{}

fun ReceiveExecutor_Costs.initExec(): int {
    val baseFee = RECEIVE_EXECUTOR_COSTS_INIT_EXEC_FEE;
    return baseFee + OffRamp_Costs.dispatchValidated();
}

fun ReceiveExecutor_Costs.confirmedOrBounced(): int {
    val baseFee = RECEIVE_EXECUTOR_COSTS_CONFIRMED_OR_BOUNCED_FEE;
    return baseFee + OffRamp_Costs.notify();
}

fun ReceiveExecutor_Costs.tokenTransfer(): int {
    return ton("0.02"); // TODO
}
