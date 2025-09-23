import "../fee_quoter/types.tolk";
import "types.tolk";

const EXECUTION_STATE_CHANGED_TOPIC: int = stringCrc32("ExecutionStateChanged");
const CCIP_COMMIT_REPORT_ACCEPTED_TOPIC: int = stringCrc32("CommitReportAccepted");

struct ExecutionStateChanged {
    sourceChainSelector: uint64,
    sequenceNumber: uint64,
    messageId: uint256,
    state: ExecutionState,
    //returnData? probably not
}
struct CommitReportAccepted {
    merkleRoot: MerkleRoot? // vec<MerkleRoots>
    priceUpdates: Cell<PriceUpdates>?;
}
