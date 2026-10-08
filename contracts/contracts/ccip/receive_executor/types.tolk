import "../offramp/types"

// SPDX-License-Identifier: BUSL-1.1

const ReceiveExecutor_FACILITY_NAME = "link.chain.ton.ccip.ReceiveExecutor";
const ReceiveExecutor_FACILITY_ID = ReceiveExecutor_FACILITY_NAME.crc32() % 640 + 10;  // 376
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

// State stores the general state machine indicating which phase we're in
struct ReceiveExecutor_State {
    tokenTransfer: Cell<ReceiveExecutor_TokenTransferInfo>?
    messageExecution: ReceiveExecutor_MessageExecutionState
    /// TON to use for message execution. Updated by the latest execute call. Depends on the gasOverride in the message
    effectiveGasLimit: coins
    /// queryId propagated from the OffRamp execution flow, used in outgoing messages
    queryId: uint64 = 0
}

struct ReceiveExecutor_TokenTransferInfo {
    /// destGasAmount is updated by the latest execute call
    transfer: Cell<Any2TVMTokenTransfer>;
    tokenAdminRegistry: address
    /// Router-owned deposit account of the receiver, where the tokens are delivered.
    receiverAccount: address
    // Offchain token data for this token transfer (untrusted).
    offchainTokenData: cell? = null;
    state : ReceiveExecutor_TokenTransferState = ReceiveExecutor_TokenTransferState_Untouched {};
}

fun ReceiveExecutor_TokenTransferInfo?.init(mutate self, transfer: Cell<Any2TVMTokenTransfer>, tokenAdminRegistry: address, receiverAccount: address, offchainTokenData: cell?): ReceiveExecutor_TokenTransferInfo {
    if (self != null) {
        // The new transfer has the updated destGasAmount, so we need to update the transfer in the state
        self.transfer = transfer;
        return self
    }

    return ReceiveExecutor_TokenTransferInfo { transfer, tokenAdminRegistry, receiverAccount, offchainTokenData };
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
/// Waiting for the released/minted tokens to reach `receiverAccount` in a single jetton transfer
/// started by `transferInitiator`.
struct ReceiveExecutor_TokenTransferState_ReleaseOrMint {
    tokenPool: address;
    transferInitiator: Cell<address>;
}
struct ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed {
    tokenPool: address;
    transferInitiator: Cell<address>;
}

enum ReceiveExecutor_MessageExecutionState {
    Untouched
    Execute
    ExecuteFailed
    Success
}
