import "types"
import "../fee_quoter/types"

const EXECUTION_STATE_CHANGED_TOPIC: int = stringCrc32("ExecutionStateChanged");
struct ExecutionStateChanged {
    sourceChainSelector: uint64,
    sequenceNumber: uint64,
    messageId: uint256,
    state: ExecutionState,
    //returnData? probably not
}

const CCIP_COMMIT_REPORT_ACCEPTED_TOPIC: int = stringCrc32("CommitReportAccepted");
struct CommitReportAccepted {
    merkleRoot: MerkleRoot? // vec<MerkleRoots>
    priceUpdates: Cell<PriceUpdates>?;
}


//TODO not used, remove?
struct SkippedAlreadyExecuted {
    sourceChainSelector: uint64;
    sequenceNumber: uint64;
}

//TODO not used, remove?
struct AlreadyAttempted {
    sourceChainSelector: uint64;
    sequenceNumber: uint64;
}

//TODO not used, remove?
struct SkippedReportExecution {
    sourceChainSelector: uint64;
}



