import "../offramp/types"
import "../receive_executor/types"

type MerkleRoot_InMessage = MerkleRoot_Validate | MerkleRoot_MarkState;

//crc32('MerkleRoot_Validate')
struct (0x038ede91) MerkleRoot_Validate {
    message: Cell<Any2TVMRampMessage>,
    permissionlessExecutionThresholdSeconds: uint32,
    metadataHash: uint256,
    gasOverride: coins?,
}

struct (0x01234567) MerkleRoot_MarkState {
    seqNum: uint64,
    state: ExecutionState
}
