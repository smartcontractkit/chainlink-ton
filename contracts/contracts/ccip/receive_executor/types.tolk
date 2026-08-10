// SPDX-License-Identifier: BUSL-1.1

const ReceiveExecutor_FACILITY_NAME = "link.chain.ton.ccip.ReceiveExecutor";
const ReceiveExecutor_FACILITY_ID = ReceiveExecutor_FACILITY_NAME.crc32() % 640 + 10;  // 376
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

// State stores the general state machine indicating which phase we're in
struct ReceiveExecutor_State {
    tokenTransfer: Cell<ReceiveExecutor_TokenTransferState>?
    messageExecution: ReceiveExecutor_MessageExecutionState
}

type ReceiveExecutor_TokenTransferState = 
    | ReceiveExecutor_TokenTransferState_Untouched
    | ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery
    | ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed
    | ReceiveExecutor_TokenTransferState_ReleaseOrMint
    | ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed
    | TokenTransferSuccess;

type ReceiveExecutor_TokenTransferState_Pending = 
    | ReceiveExecutor_TokenTransferState_Untouched
    | ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery
    | ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed
    | ReceiveExecutor_TokenTransferState_ReleaseOrMint
    | ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed;

fun ReceiveExecutor_TokenTransferState?.asPending(self, tokenAdminRegistry: address): ReceiveExecutor_TokenTransferState_Pending? {
    if (self == null) {
        return ReceiveExecutor_TokenTransferState_Untouched { tokenAdminRegistry };
    }
    return match (self) {
        ReceiveExecutor_TokenTransferState_Untouched => self,
        ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery => self,
        ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed => self,
        ReceiveExecutor_TokenTransferState_ReleaseOrMint => self,
        ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed => self,
        TokenTransferSuccess => null,
    }
}

fun ReceiveExecutor_TokenTransferState.toStateCell(self) : Cell<ReceiveExecutor_TokenTransferState> {
    return self.toCell();
}

struct ReceiveExecutor_TokenTransferState_Untouched {
    tokenAdminRegistry: address;
}

struct ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery {
    tokenAdminRegistry: address;
}

struct ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed {
    tokenAdminRegistry: address;
}

struct ReceiveExecutor_TokenTransferState_ReleaseOrMint {
    tokenAdminRegistry: address;
    tokenPool: address;
}

struct ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed {
    tokenAdminRegistry: address;
    tokenPool: address;
}

struct TokenTransferSuccess {}

enum ReceiveExecutor_MessageExecutionState {
    Untouched
    Execute
    ExecuteFailed
    Success
}