import "../../lib/utils"
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
}

struct ReceiveExecutor_TokenTransferInfo {
    /// TON to use for Token Transfer ReleaseOrMint. Updated by the latest execute call. Depends on the gasOverride in the message
    effectiveDestGasLimit: coins
    tokenAdminRegistry: address
    state : ReceiveExecutor_TokenTransferState = ReceiveExecutor_TokenTransferState_Untouched {};
}

fun ReceiveExecutor_TokenTransferInfo?.init(mutate self, tokenAdminRegistry: address, destGasLimit: coins): ReceiveExecutor_TokenTransferInfo {
    if (self != null) {
        self.effectiveDestGasLimit = destGasLimit;
        return self
    }

    return ReceiveExecutor_TokenTransferInfo { effectiveDestGasLimit: destGasLimit, tokenAdminRegistry };
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

// getEffectiveGasLimit returns the total gas amount to use for message execution
//
// If the gasOverride is not null and its receiverExecutionGasLimit is greater
// than the gasLimit from the message, it returns its receiverExecutionGasLimit.
// Otherwise, it returns gasLimit from the message, passed as an argument.
fun GasOverride?.getEffectiveGasLimit(self, gasLimit: coins): coins {
    if (self != null && self.receiverExecutionGasLimit != null && self.receiverExecutionGasLimit >= gasLimit) {
        return self.receiverExecutionGasLimit;
    }
    return gasLimit;
}

// getEffectiveTotalDestGasAmount returns the total gas amount to use for token transfer
//
// @note: We currently only support a single token transfer
//
// If the gasOverride is null, it returns the sum of destGasAmount from all token transfers in the message.
// If the gasOverride is not null, it returns the sum of max(destGasAmount, tokenGasOverride) for each
// token transfer in the message.
fun GasOverride?.getEffectiveDestGasAmount(self, tokenTransfer: Any2TVMTokenTransfer): (coins, DestGasAmountError?) {
    if (self == null || self.tokenGasOverrides == null) {
        return (tokenTransfer.destGasAmount, null);
    }
    val tokenGasOverride = self.tokenGasOverrides.asSingle();
    if (tokenGasOverride == null) {
        return (0, DestGasAmountError.ManualExecutionGasAmountCountMismatch);
    }
    return (max(tokenTransfer.destGasAmount, tokenGasOverride), null);
}

enum DestGasAmountError {
    ManualExecutionGasAmountCountMismatch
}