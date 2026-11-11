// SPDX-License-Identifier: BUSL-1.1
import "../common/types"
import "../offramp/types"
import "../offramp/messages"

type MerkleRoot_InMessage = 
    | MerkleRoot_Validate
    | MerkleRoot_MarkState;

type MerkleRoot_BouncedMessage =
    | OffRamp_ExecuteValidated;

struct (0x038ede91) MerkleRoot_Validate {
    queryId: uint64,
    message: Cell<Any2TVMRampMessage>,
    permissionlessExecutionThresholdSeconds: uint32,
    metadataHash: uint256,
    // Manual (permissionless) execution: allowed from Failure, or from Untouched once the commit
    // is older than `permissionlessExecutionThresholdSeconds`. Otherwise only the DON executes,
    // and only from Untouched.
    isManualExecution: bool,
    // Opaque to the MerkleRoot: relayed unchanged to the OffRamp on OffRamp_ExecuteValidated
    // (an OffRamp_ExecutionContext).
    context: cell,
    // Caller of the execution: refunded with the excesses when the flow ends, or with the whole
    // value if this message bounces.
    excessesTo: address,
}

struct (0x019f4cd2) MerkleRoot_MarkState {
    /// Message being marked (by `sequenceNumber`). The root relays it on
    /// MerkleRoot_ExecutionStateChanged so the OffRamp can emit the ExecutionStateChanged event.
    messageRef: RampMessageRef,
    state: ExecutionState,
    /// Caller of the execution. Once the state is marked, the excesses carried by this message
    /// are returned to the OffRamp, which refunds them to this address.
    excessesTo: address,
    /// The ReceiveExecutor deploy bounced, so the next execution attempt must deploy it again.
    executorDeployFailed: bool,
}

// -- Outgoing messages --

/// Sent by a MerkleRoot to the OffRamp whenever a message's execution state changes
/// (Success/Failure on MarkState, Failure when OffRamp_ExecuteValidated bounces). The OffRamp
/// emits the ExecutionStateChanged event only on receipt of this message, so the event always
/// reflects state already committed on the root, and refunds `excessesTo` with the value the
/// message carries (the execution excesses on the MarkState flow, nothing on the bounce flow).
struct (0x347ea073) MerkleRoot_ExecutionStateChanged {
    root: MerkleRootId;
    /// Message whose state changed: the OffRamp emits it on the ExecutionStateChanged event.
    messageRef: RampMessageRef;
    state: ExecutionState;
    /// Caller of the execution, refunded with the excesses carried by this message.
    excessesTo: address;
}

struct MerkleRoot_Costs{}

fun MerkleRoot_Costs.validate(hasTokens: bool): int {
    val baseFee = MERKLE_ROOT_COSTS_VALIDATE_FEE;
    return baseFee + OffRamp_Costs.executeValidated(hasTokens);
}

/// State update, the MerkleRoot_ExecutionStateChanged relay of the excesses to the caller and, on the
/// last message of the root, the empty reply that returns the root balance.
fun MerkleRoot_Costs.markState(): int {
    return MERKLE_ROOT_COSTS_MARK_STATE_FEE;
}

// Constants are 3x the measured compute and 2x the measured forward fees (tests/gas-report/ccip) for a 2000-byte message.
const MERKLE_ROOT_COSTS_MARK_STATE_FEE = grams("0.004");
const MERKLE_ROOT_COSTS_VALIDATE_FEE = grams("0.005");
