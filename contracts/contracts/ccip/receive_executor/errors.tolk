// SPDX-License-Identifier: BUSL-1.1
import "types"

enum ReceiveExecutor_Error {
    UpdatingStateOfNonExecutedMessage = ReceiveExecutor_FACILITY_ID * 100
    ExecutionAlreadyInProgress
    MessageAlreadyExecuted
    NotificationFromInvalidReceiver
    Unauthorized
    NoTokenAmountsInMessage
    TokenAdminRegistryUnexpectedResponse
    TokenPoolUnexpectedResponse
    TokenNotEnabledInTokenRegistry
    /// The source's destGasAmount is below the pool's release admission.
    TokenAdmissionNotMet
    /// A legacy 256-bit bounce. Only sends whose bounce is not handled yet produce them.
    UnhandledLegacyBounce
}
