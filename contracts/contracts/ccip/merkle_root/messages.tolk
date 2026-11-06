// SPDX-License-Identifier: BUSL-1.1
import "../offramp/types"
import "../offramp/messages"

type MerkleRoot_InMessage = 
    | MerkleRoot_Validate
    | MerkleRoot_MarkState;

type MerkleRoot_BouncedMessage =
    | OffRamp_ExecuteValidated;

struct (0x038ede91) MerkleRoot_Validate {
    queryID: uint64,
    message: Cell<Any2TVMRampMessage>,
    permissionlessExecutionThresholdSeconds: uint32,
    metadataHash: uint256,
    gasOverride: GasOverride?,
    offchainTokenData: lisp_list<lisp_list<cell>>,
    // Caller of the execution: refunded with the excesses when the flow ends, or with the whole
    // value if this message bounces.
    excessesTo: address,
}

//crc32('MerkleRoot_MarkState')
struct (0x019f4cd2) MerkleRoot_MarkState {
    seqNum: uint64,
    state: ExecutionState,
    /// Caller of the execution. Once the state is marked, the excesses carried by this message
    /// are returned to the OffRamp, which refunds them to this address.
    excessesTo: address,
}

struct MerkleRoot_Costs{}

fun MerkleRoot_Costs.validate(hasTokens: bool): int {
    val baseFee = MERKLE_ROOT_COSTS_VALIDATE_FEE;
    return baseFee + OffRamp_Costs.executeValidated(hasTokens);
}

/// State update, the OffRamp_ReturnExecuteExcess relay of the excesses to the caller and, on the
/// last message of the root, the empty reply that returns the root balance.
fun MerkleRoot_Costs.markState(): int {
    return MERKLE_ROOT_COSTS_MARK_STATE_FEE;
}

// Constants are 3x the measured compute and 2x the measured forward fees (tests/gas-report/ccip) for a 2000-byte message.
const MERKLE_ROOT_COSTS_MARK_STATE_FEE = grams("0.004");
const MERKLE_ROOT_COSTS_VALIDATE_FEE = grams("0.005");
