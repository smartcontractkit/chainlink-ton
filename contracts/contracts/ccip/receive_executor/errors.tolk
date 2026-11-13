// SPDX-License-Identifier: BUSL-1.1
import "types"

enum ReceiveExecutor_Error {
    UpdatingStateOfNonExecutedMessage = ReceiveExecutor_FACILITY_ID * 100
    ExecutionAlreadyInProgress
    MessageAlreadyExecuted
    NotificationFromInvalidReceiver
    Unauthorized
    TokenAdminRegistryUnexpectedResponse
    TokenPoolUnexpectedResponse
    /// A legacy 256-bit bounce. Every executor send is RichBounce or NoBounce, so none is expected.
    UnhandledLegacyBounce
}


const ReceiveExecutor_FailureErrors_FACILITY_NAME = "link.chain.ton.ccip.ReceiveExecutor.FailureErrors";
const ReceiveExecutor_FailureErrors_FACILITY_ID = ReceiveExecutor_FailureErrors_FACILITY_NAME.crc32() % 640 + 10;  // 394

/// Never thrown. Synthentic errors used in ReceiveExecutor_CCIPReceiveFailed. errorCode
enum ReceiveExecutor_FailureErrors {
    /// The source's destGasAmount is below the pool's release admission.
    TokenAdmissionNotMet = ReceiveExecutor_FailureErrors_FACILITY_ID * 100
    /// The token is not enabled in the token registry.
    TokenNotEnabledInTokenRegistry
    /// The receiver bounced the message.
    ReceiverBounced
}