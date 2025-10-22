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

const TOPIC_COMMIT_REPORT_ACCEPTED: int = stringCrc32("CommitReportAccepted");
struct CommitReportAccepted {
    merkleRoot: MerkleRoot? // vec<MerkleRoots>
    priceUpdates: Cell<PriceUpdates>?;
}

const SOURCE_CHAIN_SELECTOR_ADDED_TOPIC: int = stringCrc32("SourceChainSelectorAdded");
struct SourceChainSelectorAdded {
    sourceChainSelector: uint64;
}

const SOURCE_CHAIN_CONFIG_UPDATED_TOPIC: int = stringCrc32("SourceChainConfigUpdated");
struct SourceChainConfigUpdated {
    sourceChainSelector: uint64;
    sourceChainConfig: SourceChainConfig;
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



