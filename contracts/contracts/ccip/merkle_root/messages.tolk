// SPDX-License-Identifier: BUSL-1.1
import "../offramp/types"
import "../offramp/messages"

type MerkleRoot_InMessage = 
    | MerkleRoot_Validate
    | MerkleRoot_MarkState;

struct (0x038ede91) MerkleRoot_Validate {
    queryId: uint64,
    message: Cell<Any2TVMRampMessage>,
    permissionlessExecutionThresholdSeconds: uint32,
    metadataHash: uint256,
    gasOverride: GasOverride?,
    offchainTokenData: lisp_list<lisp_list<cell>>,
}

//crc32('MerkleRoot_MarkState')
struct (0x019f4cd2) MerkleRoot_MarkState {
    seqNum: uint64,
    state: ExecutionState
}

struct MerkleRoot_Costs{}

fun MerkleRoot_Costs.validate(hasTokens: bool): int {
    val baseFee = MERKLE_ROOT_COSTS_VALIDATE_FEE;
    return baseFee + OffRamp_Costs.executeValidated(hasTokens);
}

/// State update and the empty reply that returns the unspent value.
fun MerkleRoot_Costs.markState(): int {
    return MERKLE_ROOT_COSTS_MARK_STATE_FEE;
}

// Constants are 3x the measured compute and 2x the measured forward fees (tests/gas-report/ccip) for a 2000-byte message.
const MERKLE_ROOT_COSTS_MARK_STATE_FEE = grams("0.002");
const MERKLE_ROOT_COSTS_VALIDATE_FEE = grams("0.005");
