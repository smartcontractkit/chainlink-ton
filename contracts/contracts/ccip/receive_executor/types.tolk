import "../offramp/types"

// SPDX-License-Identifier: BUSL-1.1

const ReceiveExecutor_FACILITY_NAME = "link.chain.ton.ccip.ReceiveExecutor";
const ReceiveExecutor_FACILITY_ID = ReceiveExecutor_FACILITY_NAME.crc32() % 640 + 10;  // 376
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

// State stores the general state machine indicating which phase we're in
struct ReceiveExecutor_State {
    tokenTransfer: Cell<ReceiveExecutor_TokenTransferInfo>?
    messageExecution: ReceiveExecutor_MessageExecutionState
    // gasOverride from latest execute call.
    gasOverride: GasOverride?
}

struct ReceiveExecutor_TokenTransferInfo {
    tokenAdminRegistry: address
    state : ReceiveExecutor_TokenTransferState = ReceiveExecutor_TokenTransferState_Untouched {};
}

fun ReceiveExecutor_TokenTransferInfo?.init(self, tokenAdminRegistry: address): ReceiveExecutor_TokenTransferInfo {
    if (self != null) {
        return self
    }
    return ReceiveExecutor_TokenTransferInfo { tokenAdminRegistry };
}

type ReceiveExecutor_TokenTransferState = 
    | ReceiveExecutor_TokenTransferState_Success
    | ReceiveExecutor_TokenTransferState_Pending;

struct ReceiveExecutor_TokenTransferState_Success {}

type ReceiveExecutor_TokenTransferState_Pending = 
    | ReceiveExecutor_TokenTransferState_Untouched
    | ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery
    | ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed
    | ReceiveExecutor_TokenTransferState_ReleaseOrMint
    | ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed;

struct ReceiveExecutor_TokenTransferState_Untouched {}
struct ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery {}
struct ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed {}
struct ReceiveExecutor_TokenTransferState_ReleaseOrMint {
    tokenPool: address;
}
struct ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed {
    tokenPool: address;
}

enum ReceiveExecutor_MessageExecutionState {
    Untouched
    Execute
    ExecuteFailed
    Success
}