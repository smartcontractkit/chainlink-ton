// SPDX-License-Identifier: BUSL-1.1
import "types"
import "../fee_quoter/types"

const EXECUTION_STATE_CHANGED_TOPIC: int = "ExecutionStateChanged".crc32();
struct ExecutionStateChanged {
    sourceChainSelector: uint64,
    sequenceNumber: uint64,
    messageId: uint256,
    state: ExecutionState,
}

const TOPIC_COMMIT_REPORT_ACCEPTED: int = "CommitReportAccepted".crc32();
struct CommitReportAccepted {
    merkleRoot: MerkleRoot? // vec<MerkleRoots>
    priceUpdates: Cell<PriceUpdates>?;
}

const SOURCE_CHAIN_SELECTOR_ADDED_TOPIC: int = "SourceChainSelectorAdded".crc32();
struct SourceChainSelectorAdded {
    sourceChainSelector: uint64;
}

const SOURCE_CHAIN_CONFIG_UPDATED_TOPIC: int = "SourceChainConfigUpdated".crc32();
struct SourceChainConfigUpdated {
    sourceChainSelector: uint64;
    sourceChainConfig: SourceChainConfig;
}

const DYNAMIC_CONFIG_SET_TOPIC: int = "DynamicConfigSet".crc32();
struct OffRamp_DynamicConfigSet {
    feeQuoter: address;
    permissionlessExecutionThresholdSeconds: uint32,
}

const RECEIVE_EXECUTOR_INIT_EXECUTE_BOUNCED: int = "ReceiveExecutorInitExecuteBounced".crc32();
struct OffRamp_ReceiveExecutorInitExecuteBounced {
    receiveExecutor: address;
    root: address;
    sequenceNumber: uint64;
}

const DEPLOYABLE_INITIALIZE_BOUNCED_TOPIC: int = "DeployableInitializeBounced".crc32();
struct OffRamp_DeployableInitializeBounced {
    deployableAddress: address;
}

const ROUTE_MESSAGE_BOUNCED_TOPIC: int = "RouteMessageBounced".crc32();
struct OffRamp_RouteMessageBounced {
    router: address;
    execId: uint192;
}
